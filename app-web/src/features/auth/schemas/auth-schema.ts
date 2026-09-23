import { z } from "zod";

const passwordField = z
  .string()
  .min(15, { error: "La contraseña debe tener al menos 15 caracteres" })
  .max(128, { error: "La contraseña no puede exceder 128 caracteres" });

export const SignInSchema = z.object({
  email: z.email({ error: "El correo electrónico no es válido" }),
  password: z.string().min(1, { error: "La contraseña es obligatoria" }),
});

export const SignUpSchema = z
  .object({
    name: z.string().trim().min(1, { error: "El nombre es obligatorio" }),
    email: z.email({ error: "El correo electrónico no es válido" }),
    password: passwordField,
    passwordConfirmation: z.string().min(1, { error: "Confirme la contraseña" }),
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    error: "Las contraseñas no coinciden",
    path: ["passwordConfirmation"],
  });

export const ForgotPasswordSchema = z.object({
  email: z.email({ error: "El correo electrónico no es válido" }),
});

export const SetPasswordSchema = z
  .object({
    newPassword: passwordField,
    passwordConfirmation: z.string().min(1, { error: "Confirme la contraseña" }),
  })
  .refine((data) => data.newPassword === data.passwordConfirmation, {
    error: "Las contraseñas no coinciden",
    path: ["passwordConfirmation"],
  });

export const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, { error: "La contraseña actual es obligatoria" }),
    newPassword: passwordField,
    passwordConfirmation: z.string().min(1, { error: "Confirme la contraseña" }),
  })
  .refine((data) => data.newPassword === data.passwordConfirmation, {
    error: "Las contraseñas no coinciden",
    path: ["passwordConfirmation"],
  });

export type SignInInput = z.infer<typeof SignInSchema>;
export type SignUpInput = z.infer<typeof SignUpSchema>;
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;
export type SetPasswordInput = z.infer<typeof SetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;
