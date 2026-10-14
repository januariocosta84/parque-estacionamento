// Who may see and act on which tickets (docs/REQUIREMENTS.md "Roles"). Checked on the server.
import type { AuthContext } from '../auth/guard';
import type { Prisma } from '../generated/prisma/client';

interface TicketScope {
  agentId: string;
  areaId: string;
  status: 'ATIVO' | 'PAGO';
}

/**
 * Agents see their own tickets plus active tickets in their areas (to find a parked vehicle,
 * FR-13), but not other agents' paid tickets or revenue. Supervisors see their areas.
 * Finance and auditors see everything (read only). Admins manage settings, not tickets.
 */
export function ticketVisibility(auth: AuthContext): Prisma.TicketWhereInput | null {
  const { user } = auth;
  switch (user.role) {
    case 'agent':
      return {
        OR: [{ agentId: user.id }, { status: 'ATIVO', areaId: { in: user.areaIds } }],
      };
    case 'supervisor':
      return { areaId: { in: user.areaIds } };
    case 'finance':
    case 'auditor':
      return {};
    case 'admin':
      return null;
  }
}

export function canSeeTicket(auth: AuthContext, ticket: TicketScope): boolean {
  const { user } = auth;
  switch (user.role) {
    case 'agent':
      return (
        ticket.agentId === user.id ||
        (ticket.status === 'ATIVO' && user.areaIds.includes(ticket.areaId))
      );
    case 'supervisor':
      return user.areaIds.includes(ticket.areaId);
    case 'finance':
    case 'auditor':
      return true;
    case 'admin':
      return false;
  }
}

/** FR-14 / FR-23: agents and supervisors record exits for tickets in their areas. */
export function canRecordExit(auth: AuthContext, ticket: TicketScope): boolean {
  const { role, areaIds } = auth.user;
  return (role === 'agent' || role === 'supervisor') && areaIds.includes(ticket.areaId);
}
