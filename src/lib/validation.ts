import { z } from 'zod';

// ─── Auth Schemas ───────────────────────────────────────────────

export const loginSchema = z.object({
    email: z.string().min(2, 'Username/Email is required').max(255),
    password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

export const registerSchema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters').max(100),
    email: z.string().email('Invalid email address').max(255),
    password: z
        .string()
        .min(8, 'Password must be at least 8 characters')
        .max(128)
        .regex(
            /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
            'Password must contain at least one uppercase letter, one lowercase letter, and one number'
        ),
    confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
});

// ─── Service Schemas ────────────────────────────────────────────

export const serviceFilterSchema = z.object({
    type: z.enum(['VPS', 'EMAIL', 'VPN', 'PROXY']).optional(),
    minPrice: z.number().min(0).optional(),
    maxPrice: z.number().min(0).optional(),
    search: z.string().max(200).optional(),
});

// ─── Order Schemas ──────────────────────────────────────────────

export const orderSchema = z.object({
    serviceId: z.string().min(1, 'Service ID is required'),
    config: z.record(z.string(), z.unknown()).optional(),
    notes: z.string().max(1000).optional(),
});

// ─── VPN Config Schemas ─────────────────────────────────────────

export const vpnConfigSchema = z.object({
    protocol: z.enum(['wireguard', 'openvpn', 'ikev2']),
    serverLocation: z.string().min(2).max(50),
});

// ─── Proxy Filter Schemas ───────────────────────────────────────

export const proxyFilterSchema = z.object({
    protocol: z.enum(['http', 'socks5', 'residential']).optional(),
    location: z.string().max(5).optional(), // country code
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(100).default(20),
});

// ─── Admin Schemas ──────────────────────────────────────────────

export const adminServiceSchema = z.object({
    name: z.string().min(2).max(200),
    type: z.enum(['VPS', 'EMAIL', 'VPN', 'PROXY']),
    description: z.string().min(10).max(5000),
    price: z.number().min(0),
    specs: z.record(z.string(), z.unknown()).optional(),
    stock: z.number().int().default(-1),
    active: z.boolean().default(true),
    featured: z.boolean().default(false),
});

// ─── Contact Schema ─────────────────────────────────────────────

export const contactSchema = z.object({
    name: z.string().min(2).max(100),
    email: z.string().email().max(255),
    subject: z.string().min(5).max(200),
    message: z.string().min(10).max(5000),
});

// ─── Type Exports ───────────────────────────────────────────────

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ServiceFilterInput = z.infer<typeof serviceFilterSchema>;
export type OrderInput = z.infer<typeof orderSchema>;
export type VpnConfigInput = z.infer<typeof vpnConfigSchema>;
export type ProxyFilterInput = z.infer<typeof proxyFilterSchema>;
export type AdminServiceInput = z.infer<typeof adminServiceSchema>;
export type ContactInput = z.infer<typeof contactSchema>;
