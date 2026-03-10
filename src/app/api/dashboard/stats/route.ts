import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';

export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = session.user.id;

        // Fetch user's VPS instances
        const vpsInstances = await prisma.vpsInstance.findMany({
            where: { userId },
            include: { order: true },
        });

        // Fetch user's orders
        const orders = await prisma.order.findMany({
            where: { userId },
            include: { service: true },
        });

        // Calculate usage stats
        const activeVps = vpsInstances.filter((v: any) => v.status === 'running').length;
        const totalVps = vpsInstances.length;

        // Calculate total spending from orders
        const totalSpent = orders.reduce((sum: number, order: any) => {
            return sum + parseFloat(order.totalPrice?.toString() || '0');
        }, 0);

        // Calculate spending by period
        const now = new Date();
        const thisMonth = orders.filter((o: any) => {
            const d = new Date(o.createdAt);
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        });
        const monthlySpent = thisMonth.reduce((sum: number, o: any) => sum + parseFloat(o.totalPrice?.toString() || '0'), 0);

        // Last 24 hours
        const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const dailyOrders = orders.filter((o: any) => new Date(o.createdAt) >= last24h);
        const dailySpent = dailyOrders.reduce((sum: number, o: any) => sum + parseFloat(o.totalPrice?.toString() || '0'), 0);

        // VPN configs count
        const vpnCount = await prisma.vpnConfig.count({ where: { userId, active: true } });
        const proxyCount = await prisma.proxyAccount.count({ where: { userId, active: true } });
        const emailCount = await prisma.emailAccount.count({ where: { userId } });

        // Estimate hourly rate based on active services
        const hourlyRate = orders
            .filter((o: any) => o.status === 'ACTIVE')
            .reduce((sum: number, o: any) => {
                const price = parseFloat(o.totalPrice?.toString() || '0');
                // Rough estimate: monthly -> hourly
                return sum + (price / 720);
            }, 0);

        return NextResponse.json({
            vps: {
                total: totalVps,
                active: activeVps,
                instances: vpsInstances.map((v: any) => ({
                    id: v.id,
                    name: v.name,
                    status: v.status,
                    os: v.os,
                    specs: v.specs,
                    plan: v.order?.config,
                })),
            },
            services: {
                vpn: vpnCount,
                proxy: proxyCount,
                email: emailCount,
            },
            spending: {
                total: totalSpent.toFixed(2),
                monthly: monthlySpent.toFixed(2),
                daily: dailySpent.toFixed(2),
                hourlyRate: hourlyRate.toFixed(4),
            },
            orders: orders.map((o: any) => ({
                id: o.id,
                serviceName: o.service.name,
                serviceType: o.service.type,
                status: o.status,
                totalPrice: o.totalPrice?.toString(),
                createdAt: o.createdAt,
            })),
        });
    } catch (error) {
        console.error('Dashboard stats error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
