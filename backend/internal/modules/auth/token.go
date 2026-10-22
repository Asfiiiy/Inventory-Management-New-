package auth

import (
	platformAuth "whoopit-core/internal/platform/auth"
)

type JWTClaims = platformAuth.JWTClaims

var (
	ErrInvalidToken = platformAuth.ErrInvalidToken
	GenerateToken   = platformAuth.GenerateToken
	ParseToken      = platformAuth.ParseToken
	HashPassword    = platformAuth.HashPassword
	VerifyPassword  = platformAuth.VerifyPassword
	HasPermission   = platformAuth.HasPermission
	PermissionTable = platformAuth.PermissionTable
	CanonicalRole   = platformAuth.CanonicalRole
)
