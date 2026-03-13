#!/bin/bash
# MySQL performance tuning for 4GB VPS
# Run once: bash /tmp/mysql-tune.sh

MYSQL_CNF="/etc/mysql/mysql.conf.d/mysqld.cnf"
cp $MYSQL_CNF ${MYSQL_CNF}.bak

# Apply tuning
cat > $MYSQL_CNF << 'EOF'
[mysqld]
user= mysql
bind-address= 127.0.0.1
mysqlx-bind-address= 127.0.0.1

# Logging
key_buffer_size= 16M
log_error = /var/log/mysql/error.log
max_binlog_size = 100M

# InnoDB — main performance knob (50% of free RAM, VPS has 4GB)
innodb_buffer_pool_size = 512M
innodb_buffer_pool_instances = 2
innodb_log_buffer_size = 16M
innodb_flush_method = O_DIRECT
innodb_flush_log_at_trx_commit = 2
innodb_read_io_threads = 2
innodb_write_io_threads = 2

# Connections
max_connections = 100
thread_stack = 192K
thread_cache_size = 16
table_open_cache = 512

# Temp tables (for GROUP BY, ORDER BY with large datasets)
tmp_table_size = 64M
max_heap_table_size = 64M

# Query cache (MySQL 8 has it removed, skip if 8.x)
# query_cache_type = 0

# Slow query log (for profiling)
slow_query_log = 1
slow_query_log_file = /var/log/mysql/slow.log
long_query_time = 2
log_queries_not_using_indexes = 0

# MyISAM
myisam-recover-options = BACKUP
EOF

echo "MySQL config updated. Restarting MySQL..."
systemctl restart mysql
sleep 3
mysql -u root -e "SHOW GLOBAL VARIABLES LIKE 'innodb_buffer_pool_size';" 2>/dev/null
echo "Done."
