// Package telnet provides a persistent Telnet session pool for OLT management.
//
// Design goals (from the migration spec):
//   - Persistent sessions with keepalive — never open/close per request
//   - Max 3 concurrent sessions per OLT
//   - Auto-reconnect with exponential backoff
//   - Command timeout: 10 seconds
//   - Login sequence: username → password → wait for shell prompt
package telnet

import (
	"bufio"
	"fmt"
	"net"
	"strings"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
)

// Config holds connection parameters for a single OLT Telnet endpoint.
type Config struct {
	Host     string
	Port     int
	Username string
	Password string
	// Prompt is the string we wait for after login (e.g. "ZXAN#" or "#")
	Prompt         string
	CommandTimeout time.Duration
	KeepaliveEvery time.Duration
}

// DefaultConfig returns sensible defaults for ZTE / generic OLT.
func DefaultConfig(host string, port int, username, password string) Config {
	if port == 0 {
		port = 23
	}
	return Config{
		Host:           host,
		Port:           port,
		Username:       username,
		Password:       password,
		Prompt:         "#",
		CommandTimeout: 10 * time.Second,
		KeepaliveEvery: 30 * time.Second,
	}
}

// session represents one live Telnet connection.
type session struct {
	conn     net.Conn
	rw       *bufio.ReadWriter
	cfg      Config
	mu       sync.Mutex
	lastUsed time.Time
}

// connect dials and authenticates the session.
func connect(cfg Config) (*session, error) {
	addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)
	conn, err := net.DialTimeout("tcp", addr, 15*time.Second)
	if err != nil {
		return nil, fmt.Errorf("telnet dial %s: %w", addr, err)
	}

	s := &session{
		conn: conn,
		rw: bufio.NewReadWriter(
			bufio.NewReader(conn),
			bufio.NewWriter(conn),
		),
		cfg:      cfg,
		lastUsed: time.Now(),
	}

	if err := s.login(); err != nil {
		conn.Close()
		return nil, err
	}
	return s, nil
}

// login handles the username/password exchange and waits for the shell prompt.
func (s *session) login() error {
	// Read until Username prompt
	if err := s.readUntil("Username:", 15*time.Second); err != nil {
		// Some devices skip the username prompt if already have a session
		// Try waiting for Password prompt directly
		if err2 := s.readUntil("Password:", 5*time.Second); err2 != nil {
			return fmt.Errorf("login: waiting for Username: %w (and Password: %v)", err, err2)
		}
	} else {
		// Send username
		if err := s.writeLine(s.cfg.Username); err != nil {
			return err
		}
		// Wait for Password prompt
		if err := s.readUntil("Password:", 10*time.Second); err != nil {
			return fmt.Errorf("login: waiting for Password: %w", err)
		}
	}

	// Send password
	if err := s.writeLine(s.cfg.Password); err != nil {
		return err
	}

	// Wait for shell prompt (#)
	if err := s.readUntil(s.cfg.Prompt, 15*time.Second); err != nil {
		return fmt.Errorf("login: waiting for prompt %q: %w", s.cfg.Prompt, err)
	}

	return nil
}

// Execute sends a single command and returns the output up to the next prompt.
func (s *session) Execute(cmd string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.writeLine(cmd); err != nil {
		return "", err
	}
	out, err := s.readUntilPrompt(s.cfg.CommandTimeout)
	s.lastUsed = time.Now()
	return out, err
}

// ExecuteMultiple sends a slice of commands sequentially, collecting all output.
// Returns (allOutput, firstError).
func (s *session) ExecuteMultiple(cmds []string) (string, error) {
	var sb strings.Builder
	for _, cmd := range cmds {
		out, err := s.Execute(cmd)
		sb.WriteString(out)
		if err != nil {
			return sb.String(), fmt.Errorf("command %q: %w", cmd, err)
		}
	}
	return sb.String(), nil
}

func (s *session) writeLine(line string) error {
	_, err := fmt.Fprintf(s.rw, "%s\r\n", line)
	if err != nil {
		return err
	}
	return s.rw.Flush()
}

// readUntil reads data until the needle is found or the timeout elapses.
func (s *session) readUntil(needle string, timeout time.Duration) error {
	s.conn.SetReadDeadline(time.Now().Add(timeout))
	defer s.conn.SetReadDeadline(time.Time{})

	var buf strings.Builder
	tmp := make([]byte, 1)
	for {
		n, err := s.rw.Read(tmp)
		if n > 0 {
			buf.Write(tmp[:n])
			if strings.Contains(buf.String(), needle) {
				return nil
			}
		}
		if err != nil {
			return fmt.Errorf("read until %q: %w (got: %q)", needle, err, buf.String())
		}
	}
}

// readUntilPrompt reads until the configured prompt appears.
func (s *session) readUntilPrompt(timeout time.Duration) (string, error) {
	s.conn.SetReadDeadline(time.Now().Add(timeout))
	defer s.conn.SetReadDeadline(time.Time{})

	var buf strings.Builder
	tmp := make([]byte, 256)
	for {
		n, err := s.rw.Read(tmp)
		if n > 0 {
			buf.Write(tmp[:n])
			if strings.Contains(buf.String(), s.cfg.Prompt) {
				return buf.String(), nil
			}
		}
		if err != nil {
			return buf.String(), fmt.Errorf("read until prompt %q: %w", s.cfg.Prompt, err)
		}
	}
}

func (s *session) keepalive() {
	// Send a carriage return to keep the session alive; discard output
	s.mu.Lock()
	defer s.mu.Unlock()
	_ = s.writeLine("")
	s.conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	tmp := make([]byte, 256)
	_, _ = s.rw.Read(tmp)
	s.conn.SetReadDeadline(time.Time{})
}

func (s *session) close() {
	s.conn.Close()
}

// ─── Session Pool ─────────────────────────────────────────────────────────────

const maxSessionsPerOLT = 3

// Pool manages a pool of Telnet sessions for a single OLT.
type Pool struct {
	cfg      Config
	mu       sync.Mutex
	sessions []*session
	queue    chan chan *session
}

// NewPool creates a new Pool and starts the keepalive goroutine.
func NewPool(cfg Config) *Pool {
	p := &Pool{
		cfg:   cfg,
		queue: make(chan chan *session, 100),
	}
	go p.keepaliveLoop()
	return p
}

// keepaliveLoop sends keepalive pings to all idle sessions.
func (p *Pool) keepaliveLoop() {
	ticker := time.NewTicker(p.cfg.KeepaliveEvery)
	defer ticker.Stop()
	for range ticker.C {
		p.mu.Lock()
		for _, s := range p.sessions {
			go s.keepalive()
		}
		p.mu.Unlock()
	}
}

// acquire returns an available session or creates a new one (up to maxSessionsPerOLT).
func (p *Pool) acquire() (*session, error) {
	p.mu.Lock()
	defer p.mu.Unlock()

	// Try to find an idle session (not locked by another goroutine)
	for _, s := range p.sessions {
		if s.mu.TryLock() {
			s.mu.Unlock()
			return s, nil
		}
	}

	// Create a new session if under the limit
	if len(p.sessions) < maxSessionsPerOLT {
		s, err := connect(p.cfg)
		if err != nil {
			return nil, err
		}
		p.sessions = append(p.sessions, s)
		log.Info().Str("host", p.cfg.Host).Int("pool_size", len(p.sessions)).Msg("telnet: new session created")
		return s, nil
	}

	// All sessions busy — wait for the first one (round-robin)
	return p.sessions[0], nil
}

// Execute runs a command on any available session in the pool.
func (p *Pool) Execute(cmd string) (string, error) {
	s, err := p.acquire()
	if err != nil {
		// Try reconnect once
		s2, err2 := connect(p.cfg)
		if err2 != nil {
			return "", fmt.Errorf("pool: no session available: %w", err)
		}
		p.mu.Lock()
		p.sessions = append(p.sessions, s2)
		p.mu.Unlock()
		s = s2
	}

	out, err := s.Execute(cmd)
	if err != nil {
		// Session may be broken — remove and let caller retry
		p.removeSession(s)
		return "", err
	}
	return out, nil
}

// ExecuteMultiple runs multiple commands on a single session.
func (p *Pool) ExecuteMultiple(cmds []string) (string, error) {
	s, err := p.acquire()
	if err != nil {
		s2, err2 := connect(p.cfg)
		if err2 != nil {
			return "", fmt.Errorf("pool: no session available: %w", err)
		}
		p.mu.Lock()
		p.sessions = append(p.sessions, s2)
		p.mu.Unlock()
		s = s2
	}

	out, err := s.ExecuteMultiple(cmds)
	if err != nil {
		p.removeSession(s)
		return "", err
	}
	return out, nil
}

func (p *Pool) removeSession(target *session) {
	target.close()
	p.mu.Lock()
	defer p.mu.Unlock()
	for i, s := range p.sessions {
		if s == target {
			p.sessions = append(p.sessions[:i], p.sessions[i+1:]...)
			break
		}
	}
}

// Close closes all sessions in the pool.
func (p *Pool) Close() {
	p.mu.Lock()
	defer p.mu.Unlock()
	for _, s := range p.sessions {
		s.close()
	}
	p.sessions = nil
}

// EnsureConnected ensures at least one session is alive. Used at startup.
func (p *Pool) EnsureConnected() error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if len(p.sessions) > 0 {
		return nil
	}
	s, err := connect(p.cfg)
	if err != nil {
		return err
	}
	p.sessions = append(p.sessions, s)
	return nil
}
