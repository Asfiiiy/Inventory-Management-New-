-- Migration: 000006_auth_sessions_and_audit.down.sql

DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS sessions;
