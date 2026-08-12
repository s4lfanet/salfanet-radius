-- =====================================================
-- Salfanet Radius — FreeRADIUS IP Allocation Stored Procedure
-- Diadopsi dari FreeRADIUS 3.2.8 procedure.sql (home.pmynet.id-main)
-- Modified: Removed SET TRANSACTION (conflicts with rlm_sql transaction)
--
-- Install:
--   mysql -u salfanet_user -p salfanet_radius < fr_allocate_sp.sql
-- =====================================================

CREATE INDEX IF NOT EXISTS poolname_username_callingstationid ON radippool(pool_name, username, callingstationid);

DELIMITER $$

DROP PROCEDURE IF EXISTS fr_allocate_previous_or_new_framedipaddress;
CREATE PROCEDURE fr_allocate_previous_or_new_framedipaddress (
        IN v_pool_name VARCHAR(64),
        IN v_username VARCHAR(64),
        IN v_callingstationid VARCHAR(64),
        IN v_calledstationid VARCHAR(64),
        IN v_nasipaddress VARCHAR(15),
        IN v_pool_key VARCHAR(64),
        IN v_lease_duration INT
)
SQL SECURITY INVOKER
proc:BEGIN
        DECLARE r_address VARCHAR(15);

        DECLARE EXIT HANDLER FOR SQLEXCEPTION
        BEGIN
            ROLLBACK;
            RESIGNAL;
        END;

        START TRANSACTION;

        -- Reissue an existing IP address lease when re-authenticating a session
        SELECT framedipaddress INTO r_address
        FROM radippool
        WHERE pool_name = v_pool_name
                AND expiry_time > NOW()
                AND nasipaddress = v_nasipaddress
                AND pool_key = v_pool_key
        LIMIT 1
        FOR UPDATE;

        IF r_address IS NULL THEN
                -- Allocate a new IP address from the pool
                SELECT framedipaddress INTO r_address
                FROM radippool
                WHERE pool_name = v_pool_name
                        AND (username = '' OR username IS NULL)
                ORDER BY framedipaddress
                LIMIT 1
                FOR UPDATE;
        END IF;

        IF r_address IS NULL THEN
                -- No free IPs available
                ROLLBACK;
                LEAVE proc;
        END IF;

        -- Update the allocated IP with user info
        UPDATE radippool
        SET nasipaddress = v_nasipaddress,
                pool_key = v_pool_key,
                callingstationid = v_callingstationid,
                username = v_username,
                expiry_time = NOW() + INTERVAL v_lease_duration SECOND
        WHERE framedipaddress = r_address;

        COMMIT;

        -- Return the allocated IP address
        SELECT r_address AS framedipaddress;
END$$

DELIMITER ;
