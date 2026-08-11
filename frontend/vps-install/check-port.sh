#!/bin/bash
# ============================================================================
# SALFANET RADIUS - Port Conflict Checker & Resolver
# ============================================================================
# Check and kill processes using port 3000
# ============================================================================

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

PORT=${1:-3000}

echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}Port Conflict Checker for Port $PORT${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${YELLOW}[!] Running without root. Some processes may not be visible.${NC}"
    echo -e "${YELLOW}[!] Run with: sudo $0${NC}"
    echo ""
fi

# Method 1: lsof
echo -e "${CYAN}[>] Checking with lsof...${NC}"
if command -v lsof >/dev/null 2>&1; then
    LSOF_OUTPUT=$(lsof -i:$PORT 2>/dev/null)
    if [ -n "$LSOF_OUTPUT" ]; then
        echo "$LSOF_OUTPUT"
        echo ""
        PIDS=$(echo "$LSOF_OUTPUT" | awk 'NR>1 {print $2}' | sort -u)
    else
        echo -e "${GREEN}[✓] No processes found using port $PORT${NC}"
    fi
else
    echo -e "${YELLOW}[!] lsof not installed${NC}"
fi

echo ""

# Method 2: netstat
echo -e "${CYAN}[>] Checking with netstat...${NC}"
if command -v netstat >/dev/null 2>&1; then
    NETSTAT_OUTPUT=$(netstat -tlnp 2>/dev/null | grep ":$PORT ")
    if [ -n "$NETSTAT_OUTPUT" ]; then
        echo "$NETSTAT_OUTPUT"
        echo ""
        NETSTAT_PIDS=$(echo "$NETSTAT_OUTPUT" | awk '{print $7}' | cut -d'/' -f1 | grep -v '-' | sort -u)
        PIDS="$PIDS $NETSTAT_PIDS"
    else
        echo -e "${GREEN}[✓] No processes found using port $PORT${NC}"
    fi
else
    echo -e "${YELLOW}[!] netstat not installed${NC}"
fi

echo ""

# Method 3: ss
echo -e "${CYAN}[>] Checking with ss...${NC}"
if command -v ss >/dev/null 2>&1; then
    SS_OUTPUT=$(ss -tlnp 2>/dev/null | grep ":$PORT ")
    if [ -n "$SS_OUTPUT" ]; then
        echo "$SS_OUTPUT"
        echo ""
    else
        echo -e "${GREEN}[✓] No processes found using port $PORT${NC}"
    fi
else
    echo -e "${YELLOW}[!] ss not installed${NC}"
fi

echo ""

# Remove duplicates from PIDS
PIDS=$(echo $PIDS | tr ' ' '\n' | sort -u | tr '\n' ' ')

if [ -n "$PIDS" ]; then
    echo -e "${YELLOW}============================================${NC}"
    echo -e "${YELLOW}Processes using port $PORT:${NC}"
    echo -e "${YELLOW}============================================${NC}"
    echo ""
    
    for PID in $PIDS; do
        if [ -n "$PID" ] && [ "$PID" != "-" ]; then
            echo -e "${CYAN}[>] PID: $PID${NC}"
            ps aux | grep "^.*\s$PID\s" | grep -v grep
            echo ""
            
            # Check if it's a PM2 process
            if ps aux | grep $PID | grep -q "pm2\|PM2\|node"; then
                echo -e "${YELLOW}  This appears to be a Node.js/PM2 process${NC}"
            fi
            
            # Check process user
            PROC_USER=$(ps -o user= -p $PID 2>/dev/null)
            if [ "$PROC_USER" != "root" ] && [ "$EUID" -eq 0 ]; then
                echo -e "${YELLOW}  Running as user: $PROC_USER (not root)${NC}"
            fi
            echo ""
        fi
    done
    
    echo -e "${RED}============================================${NC}"
    echo -e "${RED}Kill these processes? [Y/n]${NC}"
    echo -e "${RED}============================================${NC}"
    read -p "Your choice: " KILL_CONFIRM
    
    if [[ ! "$KILL_CONFIRM" =~ ^[Nn]$ ]]; then
        echo ""
        echo -e "${YELLOW}[>] Killing processes...${NC}"
        
        for PID in $PIDS; do
            if [ -n "$PID" ] && [ "$PID" != "-" ]; then
                echo -e "${CYAN}[>] Killing PID $PID...${NC}"
                
                # Graceful kill
                kill $PID 2>/dev/null && echo -e "${GREEN}[✓] Sent SIGTERM to $PID${NC}" || echo -e "${RED}[✗] Failed to kill $PID${NC}"
                sleep 1
                
                # Check if still running
                if ps -p $PID > /dev/null 2>&1; then
                    echo -e "${YELLOW}[!] Process still running, force killing...${NC}"
                    kill -9 $PID 2>/dev/null && echo -e "${GREEN}[✓] Force killed $PID${NC}" || echo -e "${RED}[✗] Failed to force kill $PID${NC}"
                fi
            fi
        done
        
        echo ""
        sleep 2
        
        # Verify port is free
        echo -e "${CYAN}[>] Verifying port $PORT is free...${NC}"
        if lsof -i:$PORT >/dev/null 2>&1 || netstat -tlnp 2>/dev/null | grep -q ":$PORT "; then
            echo -e "${RED}[✗] Port $PORT is still in use!${NC}"
            echo ""
            echo -e "${YELLOW}Manual cleanup commands:${NC}"
            echo "  lsof -ti:$PORT | xargs kill -9"
            echo "  pm2 kill"
            echo "  systemctl restart salfanet-radius"
            exit 1
        else
            echo -e "${GREEN}[✓] Port $PORT is now free!${NC}"
        fi
    else
        echo -e "${YELLOW}[!] Processes not killed${NC}"
    fi
else
    echo -e "${GREEN}============================================${NC}"
    echo -e "${GREEN}[✓] Port $PORT is available!${NC}"
    echo -e "${GREEN}============================================${NC}"
fi

echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}Quick Commands:${NC}"
echo -e "${CYAN}============================================${NC}"
echo "  Check port: lsof -i:$PORT"
echo "  Kill port: lsof -ti:$PORT | xargs kill -9"
echo "  Check PM2: pm2 list"
echo "  PM2 logs: pm2 logs salfanet-radius"
echo "  Restart PM2: pm2 restart salfanet-radius"
echo "  Kill PM2: pm2 kill"
echo ""
