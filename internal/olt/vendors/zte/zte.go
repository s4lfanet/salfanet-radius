// Package zte implements OLT monitoring and management for ZTE C320 V2.1.
//
// OID reference (verified from live device — ZTE_OID_TABLE.md):
//
//	Base:           1.3.6.1.4.1.3902.1012
//	Description:    .3.28.1.1.2   (zxAnGponOnuCfgTable)
//	Serial:         .3.28.1.1.5   (Hex-STRING: 4 ASCII vendor + 4 hex SN)
//	RegStatus:      .3.50.12.1.1.1 (1 = registered/active)
//	OperState:      .3.50.12.1.1.6 (5 or 4 = online, 0 = unknown, else = offline)
//	RxPower:        .3.50.12.1.1.10 (raw integer; dBm = -(raw/1000))
//	Distance:       .3.50.12.1.1.21 (meters)
//	SeenTable:      1.3.6.1.4.1.3902.1012.3.27.4.1.1
//	PON table:      1.3.6.1.4.1.3902.1012.3.11.3.1.1
package zte

import (
	"context"
	"fmt"
	"math"
	"strconv"
	"strings"
	"sync"

	"github.com/rs/zerolog/log"
	"github.com/s4lfanet/salfanet-radius-go/internal/db/models"
	snmputil "github.com/s4lfanet/salfanet-radius-go/internal/olt/snmp"
	"github.com/s4lfanet/salfanet-radius-go/internal/olt/telnet"
)

// ─── OID constants ────────────────────────────────────────────────────────────

const (
	oidBase = "1.3.6.1.4.1.3902.1012"

	oidDescription = oidBase + ".3.28.1.1.2"
	oidSerial      = oidBase + ".3.28.1.1.5"

	oidRegStatus = oidBase + ".3.50.12.1.1.1"
	oidOperState = oidBase + ".3.50.12.1.1.6"
	oidRxPower   = oidBase + ".3.50.12.1.1.10"
	oidDistance  = oidBase + ".3.50.12.1.1.21"

	oidSeenTable = "1.3.6.1.4.1.3902.1012.3.27.4.1.1"
	oidPONTable  = "1.3.6.1.4.1.3902.1012.3.11.3.1.1"

	// ponIndex = boardBase + pon * ponIncrement
	board1Base   int64 = 268500992
	board2Base   int64 = 268509184
	ponIncrement int64 = 256
)

// PonIndex returns the SNMP ponIndex for a given board (1 or 2) and PON port (1-8).
func PonIndex(board, pon int) int64 {
	var base int64
	switch board {
	case 1:
		base = board1Base
	case 2:
		base = board2Base
	default:
		base = board1Base
	}
	return base + int64(pon)*ponIncrement
}

// ─── ONU discovery ───────────────────────────────────────────────────────────

// ONUInfo holds the collected data for one ONU.
type ONUInfo struct {
	Frame        int
	Slot         int
	Port         int
	OnuID        int
	SerialNumber string
	Description  string
	Status       models.OltOnuStatus
	RxPower      *float64 // dBm
	Distance     *int     // meters
	Registered   bool
}

// IndexKey is a compact representation of the ONU index used in lookup maps.
type IndexKey struct {
	PonIndex int64
	OnuID    int
}

// DiscoverONUsSNMP walks all PON ports concurrently and returns merged ONU data.
// ponPorts is a list of (board, port) pairs to walk. If nil, defaults to 2×8 = 16 ports.
//
// Per the spec: all 7 OID walks are launched in parallel per PON port.
func DiscoverONUsSNMP(ctx context.Context, snmpCfg snmputil.Config, ponPorts [][2]int) ([]*ONUInfo, error) {
	if len(ponPorts) == 0 {
		// Fallback: 2 boards × 8 ports
		for board := 1; board <= 2; board++ {
			for port := 1; port <= 8; port++ {
				ponPorts = append(ponPorts, [2]int{board, port})
			}
		}
	}

	// We collect results per ponIndex (ponResult is a package-level type)
	resultsCh := make(chan ponResult, len(ponPorts))

	for _, bp := range ponPorts {
		bp := bp
		go func() {
			ponIdx := PonIndex(bp[0], bp[1])
			res := walkPONPort(ctx, snmpCfg, ponIdx)
			resultsCh <- res
		}()
	}

	// Merge results
	merged := &ponResult{
		regStatus: make(map[IndexKey]int64),
		operState: make(map[IndexKey]int64),
		serials:   make(map[IndexKey]string),
		rxPower:   make(map[IndexKey]int64),
		distances: make(map[IndexKey]int64),
		descs:     make(map[IndexKey]string),
	}

	for range ponPorts {
		r := <-resultsCh
		if r.err != nil {
			log.Warn().Err(r.err).Msg("zte: PON walk error (partial results may be available)")
		}
		for k, v := range r.regStatus {
			merged.regStatus[k] = v
		}
		for k, v := range r.operState {
			merged.operState[k] = v
		}
		for k, v := range r.serials {
			merged.serials[k] = v
		}
		for k, v := range r.rxPower {
			merged.rxPower[k] = v
		}
		for k, v := range r.distances {
			merged.distances[k] = v
		}
		for k, v := range r.descs {
			merged.descs[k] = v
		}
	}

	// Build ONU list from regStatus (authoritative set of registered ONUs)
	onuMap := make(map[IndexKey]*ONUInfo)
	for k, regVal := range merged.regStatus {
		frame, slot, port, onuID := decodePonIndex(k.PonIndex, k.OnuID)

		info := &ONUInfo{
			Frame:      frame,
			Slot:       slot,
			Port:       port,
			OnuID:      onuID,
			Registered: regVal == 1,
		}

		if sn, ok := merged.serials[k]; ok {
			info.SerialNumber = sn
		}
		if desc, ok := merged.descs[k]; ok {
			info.Description = desc
		}

		operState := merged.operState[k]
		info.Status = decodeOperState(operState)

		if rxRaw, ok := merged.rxPower[k]; ok && rxRaw != 0 {
			dbm := -float64(rxRaw) / 1000.0
			info.RxPower = &dbm
		}
		if dist, ok := merged.distances[k]; ok && dist > 0 {
			d := int(dist)
			info.Distance = &d
		}

		onuMap[k] = info
	}

	// Also include ONUs visible via OperState but not in regStatus
	for k, opState := range merged.operState {
		if _, exists := onuMap[k]; exists {
			continue
		}
		frame, slot, port, onuID := decodePonIndex(k.PonIndex, k.OnuID)
		info := &ONUInfo{
			Frame:  frame,
			Slot:   slot,
			Port:   port,
			OnuID:  onuID,
			Status: decodeOperState(opState),
		}
		if sn, ok := merged.serials[k]; ok {
			info.SerialNumber = sn
		}
		onuMap[k] = info
	}

	result := make([]*ONUInfo, 0, len(onuMap))
	for _, v := range onuMap {
		result = append(result, v)
	}
	return result, nil
}

// walkPONPort walks the 6 OIDs for a single PON port index in parallel.
type ponResult struct {
	regStatus map[IndexKey]int64
	operState map[IndexKey]int64
	serials   map[IndexKey]string
	rxPower   map[IndexKey]int64
	distances map[IndexKey]int64
	descs     map[IndexKey]string
	err       error
}

func walkPONPort(ctx context.Context, cfg snmputil.Config, ponIdx int64) ponResult {
	type oidWalk struct {
		oid string
		key string
	}

	oids := []oidWalk{
		{oidRegStatus, "regStatus"},
		{oidOperState, "operState"},
		{oidSerial, "serial"},
		{oidRxPower, "rxPower"},
		{oidDistance, "distance"},
		{oidDescription, "desc"},
	}

	type walkOut struct {
		key     string
		results []snmputil.WalkResult
		err     error
	}

	ch := make(chan walkOut, len(oids))
	for _, o := range oids {
		o := o
		// Walk OID suffix for this ponIndex
		fullOID := fmt.Sprintf("%s.%d", o.oid, ponIdx)
		go func() {
			res, err := snmputil.Walk(ctx, cfg, fullOID)
			ch <- walkOut{key: o.key, results: res, err: err}
		}()
	}

	pr := ponResult{
		regStatus: make(map[IndexKey]int64),
		operState: make(map[IndexKey]int64),
		serials:   make(map[IndexKey]string),
		rxPower:   make(map[IndexKey]int64),
		distances: make(map[IndexKey]int64),
		descs:     make(map[IndexKey]string),
	}

	for range oids {
		out := <-ch
		if out.err != nil {
			pr.err = out.err
			continue
		}

		for _, r := range out.results {
			// OID suffix after the base OID is: .ponIndex.onuId  (for RegStatus/OperState)
			// or .ponIndex.slotId.onuId depending on table — we extract onuId as last component
			onuID := lastOIDComponent(r.OID)
			if onuID <= 0 {
				continue
			}
			k := IndexKey{PonIndex: ponIdx, OnuID: onuID}

			switch out.key {
			case "regStatus", "operState", "rxPower", "distance":
				v, ok := snmputil.ToInt(r.Value)
				if !ok {
					break
				}
				switch out.key {
				case "regStatus":
					pr.regStatus[k] = v
				case "operState":
					pr.operState[k] = v
				case "rxPower":
					pr.rxPower[k] = v
				case "distance":
					pr.distances[k] = v
				}
			case "serial":
				pr.serials[k] = ParseSerial(r.Value)
			case "desc":
				pr.descs[k] = snmputil.ToString(r.Value)
			}
		}
	}

	return pr
}

// ─── Serial parsing ──────────────────────────────────────────────────────────

// ParseSerial converts the SNMP Hex-STRING serial value to a human-readable serial.
// SNMP returns 8 bytes: first 4 are ASCII vendor prefix, last 4 are hex SN.
// Result example: "ZTEGDA5918AC"
func ParseSerial(value interface{}) string {
	b, ok := value.([]byte)
	if !ok {
		// Try string representation like "5a 54 45 47 da 59 18 ac"
		s := snmputil.ToString(value)
		b = hexStringToBytes(s)
		if len(b) == 0 {
			return s
		}
	}

	if len(b) < 8 {
		return fmt.Sprintf("%X", b)
	}

	vendor := string(b[0:4])
	// Replace non-printable chars in vendor portion
	var vb strings.Builder
	for _, c := range vendor {
		if c >= 0x20 && c <= 0x7e {
			vb.WriteRune(c)
		} else {
			fmt.Fprintf(&vb, "%02X", c)
		}
	}

	snHex := fmt.Sprintf("%02X%02X%02X%02X", b[4], b[5], b[6], b[7])
	return vb.String() + snHex
}

// hexStringToBytes parses space-separated hex strings like "5a 54 45 47 da 59 18 ac".
func hexStringToBytes(s string) []byte {
	parts := strings.Fields(s)
	out := make([]byte, 0, len(parts))
	for _, p := range parts {
		v, err := strconv.ParseUint(p, 16, 8)
		if err != nil {
			return nil
		}
		out = append(out, byte(v))
	}
	return out
}

// ─── Unregistered ONU (Telnet) ───────────────────────────────────────────────

// UnregisteredONU holds data about an ONU that is seen but not registered.
type UnregisteredONU struct {
	// Port string like "gpon-onu_1/1/1:2"
	PortString   string
	Frame        int
	Slot         int
	Port         int
	OnuID        int
	SerialNumber string
	State        string
}

// GetUnregisteredONUs fetches unregistered ONUs via Telnet.
// It uses "show gpon onu uncfg" (global, all ports) as the authoritative source.
//
// Format: gpon-onu_1/1/1:2  ZTEGDA5918AC  unknown   (3 columns, SN at index 1)
func GetUnregisteredONUs(pool *telnet.Pool) ([]*UnregisteredONU, error) {
	output, err := pool.Execute("show gpon onu uncfg")
	if err != nil {
		return nil, fmt.Errorf("show gpon onu uncfg: %w", err)
	}
	return ParseUncfgOutput(output), nil
}

// ParseUncfgOutput parses the output of "show gpon onu uncfg".
// Line format: gpon-onu_FRAME/SLOT/PORT:ONUID  SERIAL  STATE
func ParseUncfgOutput(output string) []*UnregisteredONU {
	var results []*UnregisteredONU
	for _, line := range strings.Split(output, "\n") {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "gpon-onu_") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 3 {
			continue
		}
		portStr := fields[0] // gpon-onu_1/1/1:2
		sn := fields[1]      // ZTEGDA5918AC — SN always at index 1
		state := fields[2]

		frame, slot, port, onuID, err := parsePortString(portStr)
		if err != nil {
			log.Warn().Str("port", portStr).Err(err).Msg("zte: failed to parse unregistered ONU port string")
			continue
		}

		results = append(results, &UnregisteredONU{
			PortString:   portStr,
			Frame:        frame,
			Slot:         slot,
			Port:         port,
			OnuID:        onuID,
			SerialNumber: sn,
			State:        state,
		})
	}
	return results
}

// parsePortString parses "gpon-onu_1/1/2:3" → frame=1, slot=1, port=2, onuID=3.
func parsePortString(s string) (frame, slot, port, onuID int, err error) {
	s = strings.TrimPrefix(s, "gpon-onu_")
	// format: frame/slot/port:onuID
	colonIdx := strings.LastIndex(s, ":")
	if colonIdx < 0 {
		return 0, 0, 0, 0, fmt.Errorf("no colon in port string %q", s)
	}
	onuIDStr := s[colonIdx+1:]
	portPart := s[:colonIdx]
	parts := strings.Split(portPart, "/")
	if len(parts) != 3 {
		return 0, 0, 0, 0, fmt.Errorf("expected 3 parts in %q", portPart)
	}
	frame, _ = strconv.Atoi(parts[0])
	slot, _ = strconv.Atoi(parts[1])
	port, _ = strconv.Atoi(parts[2])
	onuID, _ = strconv.Atoi(onuIDStr)
	return
}

// ─── ONU Registration ────────────────────────────────────────────────────────

// RegisterParams holds the parameters for registering a new ONU.
type RegisterParams struct {
	Frame        int
	Slot         int
	Port         int
	OnuID        int
	SerialNumber string
	OnuType      string
	TcontProfile string
	VLAN         int
}

// RegisterONU sends the ZTE basic registration command sequence via Telnet.
// It returns an error if any CLI error is detected (lines starting with "%").
func RegisterONU(pool *telnet.Pool, p RegisterParams) error {
	cmds := []string{
		"configure terminal",
		fmt.Sprintf("interface gpon-olt_%d/%d/%d", p.Frame, p.Slot, p.Port),
		fmt.Sprintf("onu %d type %s sn %s", p.OnuID, p.OnuType, p.SerialNumber),
		"exit",
		fmt.Sprintf("interface gpon-onu_%d/%d/%d:%d", p.Frame, p.Slot, p.Port, p.OnuID),
		fmt.Sprintf("tcont 1 profile %s", p.TcontProfile),
		"gemport 1 tcont 1",
		fmt.Sprintf("service-port 1 vport 1 user-vlan %d vlan %d", p.VLAN, p.VLAN),
		"exit",
		"end",
	}

	output, err := pool.ExecuteMultiple(cmds)
	if err != nil {
		return fmt.Errorf("register ONU: %w", err)
	}

	// Detect CLI errors: only match lines that START with "%"
	for _, line := range strings.Split(output, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "%") {
			return fmt.Errorf("OLT CLI error: %s", line)
		}
		lower := strings.ToLower(line)
		// Additional known error patterns (must not match normal OLT MOTD)
		if strings.Contains(lower, "invalid input") ||
			strings.Contains(lower, "invalid command") ||
			strings.Contains(lower, "already exist") {
			return fmt.Errorf("OLT CLI error: %s", line)
		}
	}

	return nil
}

// DeregisterONU removes an ONU from a PON port via Telnet.
func DeregisterONU(pool *telnet.Pool, frame, slot, port, onuID int) error {
	cmds := []string{
		"configure terminal",
		fmt.Sprintf("interface gpon-olt_%d/%d/%d", frame, slot, port),
		fmt.Sprintf("no onu %d", onuID),
		"exit",
		"end",
	}
	output, err := pool.ExecuteMultiple(cmds)
	if err != nil {
		return err
	}
	for _, line := range strings.Split(output, "\n") {
		if strings.HasPrefix(strings.TrimSpace(line), "%") {
			return fmt.Errorf("OLT CLI error during deregister: %s", strings.TrimSpace(line))
		}
	}
	return nil
}

// ─── ONU Types ───────────────────────────────────────────────────────────────

// ONUType holds metadata about a supported ONU type on this OLT.
type ONUType struct {
	Name string
}

// GetONUTypes fetches the list of registered ONU types from the OLT.
// NOTE: The correct command for ZTE C320 V2.1 is "show onu-type" — NOT "show gpon onu-type".
func GetONUTypes(pool *telnet.Pool) ([]ONUType, error) {
	output, err := pool.Execute("show onu-type")
	if err != nil {
		return nil, err
	}
	return parseONUTypes(output), nil
}

func parseONUTypes(output string) []ONUType {
	var types []ONUType
	seen := make(map[string]bool)
	for _, line := range strings.Split(output, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "-") || strings.HasPrefix(line, "ONU") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) == 0 {
			continue
		}
		name := fields[0]
		if name == "" || seen[name] {
			continue
		}
		seen[name] = true
		types = append(types, ONUType{Name: name})
	}
	return types
}

// ─── TCONT Profiles ──────────────────────────────────────────────────────────

// TcontProfile holds a bandwidth profile name.
type TcontProfile struct {
	Name string
}

// GetTcontProfiles fetches available TCONT profiles.
func GetTcontProfiles(pool *telnet.Pool) ([]TcontProfile, error) {
	output, err := pool.Execute("show gpon traffic-profile")
	if err != nil {
		return nil, err
	}
	return parseTcontProfiles(output), nil
}

func parseTcontProfiles(output string) []TcontProfile {
	var profiles []TcontProfile
	seen := make(map[string]bool)
	for _, line := range strings.Split(output, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "-") || strings.HasPrefix(line, "Profile") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) == 0 {
			continue
		}
		name := fields[0]
		if seen[name] {
			continue
		}
		seen[name] = true
		profiles = append(profiles, TcontProfile{Name: name})
	}
	return profiles
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// decodeOperState converts the raw ZTE OperState integer to our OltOnuStatus.
// 5 or 4 = online, 0 = unknown → offline, anything else = offline.
func decodeOperState(v int64) models.OltOnuStatus {
	switch v {
	case 4, 5:
		return models.OnuOnline
	default:
		return models.OnuOffline
	}
}

// lastOIDComponent extracts the last numeric component from an OID string.
// e.g. ".1.3.6.1.4.1.3902.1012.3.50.12.1.1.6.268501248.1" → 1
func lastOIDComponent(oid string) int {
	parts := strings.Split(oid, ".")
	for i := len(parts) - 1; i >= 0; i-- {
		if v, err := strconv.Atoi(parts[i]); err == nil && v > 0 {
			return v
		}
	}
	return 0
}

// decodePonIndex decodes a ponIndex back to (frame, slot, port).
// ponIndex = boardBase + port * ponIncrement
func decodePonIndex(ponIdx int64, onuID int) (frame, slot, port, onu int) {
	onu = onuID
	var offset int64
	frame = 1
	slot = 1

	if ponIdx >= board2Base {
		frame = 2
		offset = ponIdx - board2Base
	} else {
		offset = ponIdx - board1Base
	}

	if ponIncrement > 0 {
		port = int(offset / ponIncrement)
	}
	return
}

// decodePowerDBM converts raw SNMP RxPower to dBm.
func decodePowerDBM(raw int64) float64 {
	if raw == 0 {
		return 0
	}
	return -math.Abs(float64(raw)) / 1000.0
}

// ─── Concurrent PON Discovery (exported) ─────────────────────────────────────

// DiscoverResult is the full result of a PON discovery run.
type DiscoverResult struct {
	RegisteredONUs   []*ONUInfo
	UnregisteredONUs []*UnregisteredONU
	Errors           []error
}

// DiscoverAll runs SNMP discovery and (if Telnet pool is provided) fetches unregistered ONUs.
// This is the main entry point called by the poller.
func DiscoverAll(ctx context.Context, snmpCfg snmputil.Config, telnetPool *telnet.Pool, ponPorts [][2]int) *DiscoverResult {
	result := &DiscoverResult{}

	var wg sync.WaitGroup
	var mu sync.Mutex

	// SNMP discovery
	wg.Add(1)
	go func() {
		defer wg.Done()
		onus, err := DiscoverONUsSNMP(ctx, snmpCfg, ponPorts)
		mu.Lock()
		defer mu.Unlock()
		if err != nil {
			result.Errors = append(result.Errors, fmt.Errorf("SNMP discovery: %w", err))
		}
		result.RegisteredONUs = onus
	}()

	// Telnet: unregistered ONUs (only if Telnet is available)
	if telnetPool != nil {
		wg.Add(1)
		go func() {
			defer wg.Done()
			uncfg, err := GetUnregisteredONUs(telnetPool)
			mu.Lock()
			defer mu.Unlock()
			if err != nil {
				result.Errors = append(result.Errors, fmt.Errorf("telnet uncfg: %w", err))
				return
			}
			// Telnet is authoritative: discard seen-table SNMP ghosts
			result.UnregisteredONUs = uncfg
		}()
	}

	wg.Wait()
	return result
}
