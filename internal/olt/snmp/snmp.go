// Package snmp provides a thin, typed wrapper around gosnmp for OLT polling.
package snmp

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/gosnmp/gosnmp"
)

// Config holds the SNMP connection parameters for one OLT.
type Config struct {
	Target    string
	Community string
	Port      uint16
	Timeout   time.Duration
	Retries   int
	Version   gosnmp.SnmpVersion
}

// DefaultConfig returns a sensible default for SNMP v2c.
func DefaultConfig(host, community string, port int) Config {
	if port == 0 {
		port = 161
	}
	return Config{
		Target:    host,
		Community: community,
		Port:      uint16(port),
		Timeout:   10 * time.Second,
		Retries:   2,
		Version:   gosnmp.Version2c,
	}
}

// WalkResult is a single OID → value pair from an SNMP walk.
type WalkResult struct {
	OID   string
	Type  gosnmp.Asn1BER
	Value interface{}
}

// Walk performs an SNMP WALK on the given OID prefix and returns all results.
// It is safe to call from multiple goroutines — each call opens its own session.
func Walk(ctx context.Context, cfg Config, oid string) ([]WalkResult, error) {
	g := &gosnmp.GoSNMP{
		Target:    cfg.Target,
		Port:      cfg.Port,
		Community: cfg.Community,
		Version:   cfg.Version,
		Timeout:   cfg.Timeout,
		Retries:   cfg.Retries,
		MaxOids:   gosnmp.MaxOids,
	}

	if err := g.Connect(); err != nil {
		return nil, fmt.Errorf("snmp connect to %s: %w", cfg.Target, err)
	}
	defer g.Conn.Close()

	done := make(chan struct{})
	var results []WalkResult
	var walkErr error

	go func() {
		defer close(done)
		err := g.Walk(oid, func(pdu gosnmp.SnmpPDU) error {
			results = append(results, WalkResult{
				OID:   pdu.Name,
				Type:  pdu.Type,
				Value: pdu.Value,
			})
			return nil
		})
		walkErr = err
	}()

	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-done:
	}

	return results, walkErr
}

// Get retrieves specific OIDs in a single SNMP GET request.
func Get(ctx context.Context, cfg Config, oids []string) ([]WalkResult, error) {
	g := &gosnmp.GoSNMP{
		Target:    cfg.Target,
		Port:      cfg.Port,
		Community: cfg.Community,
		Version:   cfg.Version,
		Timeout:   cfg.Timeout,
		Retries:   cfg.Retries,
	}

	if err := g.Connect(); err != nil {
		return nil, fmt.Errorf("snmp connect to %s: %w", cfg.Target, err)
	}
	defer g.Conn.Close()

	type result struct {
		pdus []gosnmp.SnmpPDU
		err  error
	}
	ch := make(chan result, 1)

	go func() {
		packet, err := g.Get(oids)
		if err != nil {
			ch <- result{err: err}
			return
		}
		ch <- result{pdus: packet.Variables}
	}()

	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case r := <-ch:
		if r.err != nil {
			return nil, r.err
		}
		out := make([]WalkResult, 0, len(r.pdus))
		for _, pdu := range r.pdus {
			out = append(out, WalkResult{OID: pdu.Name, Type: pdu.Type, Value: pdu.Value})
		}
		return out, nil
	}
}

// ─── Value extractors ─────────────────────────────────────────────────────────

// ToInt converts a WalkResult value to int64. Returns 0 and false if not possible.
func ToInt(v interface{}) (int64, bool) {
	switch x := v.(type) {
	case int:
		return int64(x), true
	case int32:
		return int64(x), true
	case int64:
		return x, true
	case uint:
		return int64(x), true
	case uint32:
		return int64(x), true
	case uint64:
		return int64(x), true
	}
	return 0, false
}

// ToString converts a WalkResult value to string.
func ToString(v interface{}) string {
	switch x := v.(type) {
	case string:
		return x
	case []byte:
		return string(x)
	}
	return fmt.Sprintf("%v", v)
}

// ToHexString converts a raw byte-slice value to an uppercase hex string like "DA5918AC".
func ToHexString(v interface{}) string {
	b, ok := v.([]byte)
	if !ok {
		return ""
	}
	parts := make([]string, len(b))
	for i, byt := range b {
		parts[i] = fmt.Sprintf("%02X", byt)
	}
	return strings.Join(parts, "")
}

// OIDSuffix extracts the suffix from a full OID given the base prefix.
// e.g. OIDSuffix(".1.3.6.1.4.1.3902.1012.3.50.12.1.1.6.268501248.1", "1.3.6.1.4.1.3902.1012.3.50.12.1.1.6")
// → ".268501248.1"
func OIDSuffix(fullOID, base string) string {
	// Normalise: ensure both start with "."
	if !strings.HasPrefix(base, ".") {
		base = "." + base
	}
	if !strings.HasPrefix(fullOID, ".") {
		fullOID = "." + fullOID
	}
	if strings.HasPrefix(fullOID, base) {
		return fullOID[len(base):]
	}
	return ""
}
