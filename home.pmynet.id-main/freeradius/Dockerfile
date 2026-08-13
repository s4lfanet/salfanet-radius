FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=Asia/Jakarta

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        freeradius \
        freeradius-mysql \
        freeradius-utils \
        tzdata && \
    rm -rf /var/lib/apt/lists/*

# Copy custom config files
COPY mods-available/sql /etc/freeradius/3.0/mods-available/sql
COPY mods-config/sql/main/mysql/queries.conf /etc/freeradius/3.0/mods-config/sql/main/mysql/queries.conf
COPY clients.conf       /etc/freeradius/3.0/clients.conf
COPY sites-available/default /etc/freeradius/3.0/sites-available/default

# Enable SQL module
RUN ln -sf /etc/freeradius/3.0/mods-available/sql \
           /etc/freeradius/3.0/mods-enabled/sql

# Disable inner-tunnel (port 18120 conflicts with existing FreeRADIUS; not needed for PPPoE)
RUN rm -f /etc/freeradius/3.0/sites-enabled/inner-tunnel

# Fix ownership
RUN chown -R freerad:freerad /etc/freeradius/3.0/

CMD ["/usr/sbin/freeradius", "-f", "-l", "stdout"]
