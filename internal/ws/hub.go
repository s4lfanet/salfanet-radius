// Package ws provides a WebSocket hub for broadcasting OLT/ONU status updates.
//
// Clients subscribe to a specific OLT ID and receive JSON messages whenever
// the poller finishes a poll cycle.
package ws

import (
	"encoding/json"
	"sync"
	"time"

	"github.com/fasthttp/websocket"
	"github.com/rs/zerolog/log"
)

// Client represents a single WebSocket connection subscribed to one OLT.
type Client struct {
	conn  *websocket.Conn
	oltID string
	send  chan []byte
}

// Hub manages all active WebSocket clients.
type Hub struct {
	mu      sync.RWMutex
	clients map[string][]*Client // oltID → list of clients
}

// New creates and returns a new Hub.
func New() *Hub {
	return &Hub{
		clients: make(map[string][]*Client),
	}
}

// Register adds a client to the hub for the given OLT.
func (h *Hub) Register(conn *websocket.Conn, oltID string) *Client {
	c := &Client{
		conn:  conn,
		oltID: oltID,
		send:  make(chan []byte, 64),
	}

	h.mu.Lock()
	h.clients[oltID] = append(h.clients[oltID], c)
	total := len(h.clients[oltID])
	h.mu.Unlock()

	log.Debug().Str("olt", oltID).Int("clients", total).Msg("ws: client registered")

	// Start write pump
	go c.writePump()

	return c
}

// Unregister removes a client from the hub.
func (h *Hub) Unregister(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	list := h.clients[c.oltID]
	for i, client := range list {
		if client == c {
			h.clients[c.oltID] = append(list[:i], list[i+1:]...)
			close(c.send)
			break
		}
	}
	log.Debug().Str("olt", c.oltID).Msg("ws: client unregistered")
}

// Broadcast sends a JSON message to all clients subscribed to the given OLT.
func (h *Hub) Broadcast(oltID string, data interface{}) {
	payload, err := json.Marshal(data)
	if err != nil {
		log.Error().Err(err).Msg("ws: marshal error")
		return
	}

	h.mu.RLock()
	clients := make([]*Client, len(h.clients[oltID]))
	copy(clients, h.clients[oltID])
	h.mu.RUnlock()

	for _, c := range clients {
		select {
		case c.send <- payload:
		default:
			// Client buffer full — drop the message
			log.Warn().Str("olt", oltID).Msg("ws: client buffer full, dropping message")
		}
	}
}

// BroadcastAll sends a message to ALL connected clients regardless of OLT.
func (h *Hub) BroadcastAll(data interface{}) {
	payload, err := json.Marshal(data)
	if err != nil {
		return
	}

	h.mu.RLock()
	var allClients []*Client
	for _, list := range h.clients {
		allClients = append(allClients, list...)
	}
	h.mu.RUnlock()

	for _, c := range allClients {
		select {
		case c.send <- payload:
		default:
		}
	}
}

// Adapter returns a BroadcastFn compatible with the poller package.
func (h *Hub) Adapter() func(oltID string, data interface{}) {
	return func(oltID string, data interface{}) {
		h.Broadcast(oltID, data)
	}
}

// writePump drains the send channel and writes to the WebSocket connection.
func (c *Client) writePump() {
	ticker := time.NewTicker(30 * time.Second)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case msg, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				log.Debug().Err(err).Str("olt", c.oltID).Msg("ws: write error")
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
