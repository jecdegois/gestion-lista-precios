-- Método de login de cada sesión; el cambio de contraseña obligatorio solo aplica a "password"
CREATE TYPE "AuthProvider" AS ENUM ('password', 'google');
ALTER TABLE "sessions" ADD COLUMN "auth_provider" "AuthProvider" NOT NULL DEFAULT 'password';
