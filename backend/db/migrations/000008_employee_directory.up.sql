-- Employee directory fields on tenant users (Office IT staff master)
ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_code VARCHAR(64) NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS department VARCHAR(128) NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS desk_location VARCHAR(128) NOT NULL DEFAULT '';
