export function buildPasswordResetEmail({ firstName, protocol, domain, token }) {
    return `
Hello ${firstName},

You requested a password reset for your account.

Please click the link below to reset your password:
${protocol}://${domain}/password-reset/confirm/${token}

If you didn't request this password reset, please ignore this email.

This link will expire in 1 hour for security reasons.

Best regards,
The IT Team
`;
}
