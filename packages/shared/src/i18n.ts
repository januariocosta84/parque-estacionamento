// User-facing strings (NFR-05). Portuguese is the default locale.
// Placeholders use {name} and must match between locales (checked by tests).
//
// TODO(AMD): the Tetum strings are a first draft and must be reviewed by a native speaker.
// Vehicle class names are not here: they live in the database (namePt / nameTet).

export const locales = ['pt', 'tet'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'pt';

const pt = {
  // ── Common ──
  appName: 'Estacionamento Dili',
  authorityName: 'Autoridade Municipal de Dili',
  'language.pt': 'Português',
  'language.tet': 'Tetum',
  'status.ATIVO': 'Ativo',
  'status.PAGO': 'Pago',
  'payment.CASH': 'Numerário',
  'copy.WHITE': 'Branca',
  'copy.YELLOW': 'Amarela',
  'copy.RED': 'Vermelha',
  'role.agent': 'Agente',
  'role.supervisor': 'Supervisor',
  'role.finance': 'Finanças',
  'role.auditor': 'Auditor',
  'role.admin': 'Administrador',
  'unit.hours.one': '{n} hora',
  'unit.hours.other': '{n} horas',
  'unit.perHour': '{amount} / hora',
  currencyNote: 'Valores em dólares americanos (USD).',

  // ── Agent: tabs ──
  'tab.home': 'Início',
  'tab.newTicket': 'Novo título',
  'tab.history': 'Histórico',

  // ── Agent: sign in (00) ──
  'agentLogin.subtitle': 'Entrada do agente de estacionamento',
  'agentLogin.agentNumber': 'Número de agente',
  'agentLogin.pin': 'PIN (6 dígitos)',
  'agentLogin.submit': 'Entrar',
  'agentLogin.forgotPin': 'Esqueceu o PIN? Contacte o supervisor',
  'agentLogin.offlineNote':
    'Sem rede? Pode entrar com o último acesso guardado neste telemóvel. Os títulos sincronizam quando houver ligação.',
  'agentLogin.wrongPin': 'PIN incorreto. Tentativas restantes: {remaining}',
  'agentLogin.locked': 'Conta bloqueada. Contacte o supervisor.',

  // ── Agent: home (01) ──
  'home.parked': 'Estacionados',
  'home.receivedToday': 'Recebido hoje',
  'home.issueNew': 'Emitir novo título',
  'home.parkedVehicles': 'Veículos estacionados',
  'home.seeAll': 'Ver todos · {count}',

  // ── Agent: new ticket (02) ──
  'newTicket.eyebrow': 'Estacionamento · Emissão',
  'newTicket.title': 'Novo título',
  'newTicket.intro': 'Identifique o veículo para abrir um registo de estacionamento.',
  'newTicket.plate': 'Matrícula do veículo',
  'newTicket.vehicleType': 'Tipo de veículo',
  'newTicket.issueData': 'Dados de emissão',
  'newTicket.date': 'Data',
  'newTicket.entryTime': 'Hora de entrada',
  'newTicket.agent': 'Agente',
  'newTicket.tariffNote': 'Tarifa: {amount}/h. Cobrança calculada ao registar a saída.',
  'newTicket.copiesCount': '3 cópias digitais',
  'newTicket.submit': 'Emitir título de estacionamento',

  // ── Agent: ticket issued (03) ──
  'issued.eyebrow': 'Estacionamento · Registo aberto',
  'issued.title': 'Título emitido',
  'issued.registeredAt': 'Emissão registada às {time}',
  'issued.ticketHeading': 'Título de Estacionamento',
  'issued.dateEntry': 'Data / entrada',
  'issued.issuingAgent': 'Agente emissor',
  'issued.copies': '3 cópias digitais',
  'issued.inRecord': 'No registo',
  'issued.recordExit': 'Registar saída',

  // ── Agent: record exit (04) ──
  'exit.eyebrow': 'Estacionamento · Cálculo',
  'exit.title': 'Registar saída',
  'exit.exitOn': 'Saída · {date}',
  'exit.entry': 'Entrada',
  'exit.timeParked': 'Tempo estacionado',
  'exit.hoursCharged': 'Horas cobradas',
  'exit.tariff': 'Tarifa',
  'exit.paymentMethod': 'Método de pagamento',
  'exit.totalDue': 'Total a pagar',
  'exit.ruleNote': 'Cada hora iniciada conta como uma hora completa: 1 h 45 min → 2 h.',
  'exit.confirm': 'Confirmar saída e pagamento',

  // ── Agent: payment received (05) ──
  'receipt.eyebrow': 'Estacionamento · Recibo',
  'receipt.title': 'Pagamento recebido',
  'receipt.receivedClosed': 'Recebido · registo encerrado',
  'receipt.heading': 'Recibo de pagamento',
  'receipt.date': 'Data',
  'receipt.entryExit': 'Entrada / saída',
  'receipt.hoursCharged': 'Horas cobradas',
  'receipt.method': 'Método',
  'receipt.amountReceived': 'Valor recebido',
  'receipt.agent': 'Agente',
  'receipt.registeredAt': 'Pagamento registado às {time}',
  'receipt.backHome': 'Voltar ao início',

  // ── Agent: history (06) ──
  'history.eyebrow': 'Estacionamento · Auditoria',
  'history.title': 'Histórico',
  'history.search': 'Matrícula ou número do título',
  'history.filter.all': 'Todos',
  'history.filter.active': 'Ativos',
  'history.filter.paid': 'Pagos',
  'history.allTickets': 'Todos os títulos',
  'history.inProgress': 'Em curso',

  // ── Console: sign in ──
  'consoleLogin.title': 'Entrar',
  'consoleLogin.subtitle': 'Supervisores, Finanças e Auditoria',
  'consoleLogin.username': 'Utilizador',
  'consoleLogin.password': 'Palavra-passe',
  'consoleLogin.smsCode': 'Código de verificação (SMS)',
  'consoleLogin.submit': 'Entrar na consola',
  'consoleLogin.forgotPassword': 'Esqueceu a palavra-passe?',
  'consoleLogin.auditNote': 'Cada acesso fica registado na auditoria.',
  'consoleLogin.heroTitle': 'Consola de supervisão',
  'consoleLogin.heroText': 'Títulos, saídas e recebimentos de todas as áreas, num único painel.',

  // ── Console: navigation ──
  'nav.operations': 'Operações',
  'nav.monitoring': 'Monitorização',
  'nav.activeTickets': 'Títulos ativos',
  'nav.newTicket': 'Novo título',
  'nav.history': 'Histórico',
  'nav.payments': 'Pagamentos',
  'nav.audit': 'Auditoria',
  'nav.consoleName': 'Consola de supervisão',

  // ── Console: monitoring (07) ──
  'monitor.eyebrow': 'Operações · Visão geral',
  'monitor.title': 'Monitorização em tempo real',
  'monitor.lastUpdate': 'Última atualização',
  'monitor.refresh': 'Atualizar',
  'filter.area': 'Área',
  'filter.date': 'Data',
  'filter.agent': 'Agente',
  'filter.allAreas': 'Todas as áreas',
  'filter.allAgents': 'Todos os agentes',
  'monitor.parkedVehicles': 'Veículos estacionados',
  'monitor.receivedToday': 'Recebido hoje',
  'monitor.paymentsCount': '{count} pagamentos registados',
  'monitor.issuedToday': 'Títulos emitidos hoje',
  'monitor.issuedBreakdown': '{active} ativos + {paid} pagos',
  'monitor.exits': 'Saídas registadas',
  'monitor.exitsBreakdown': '{count} títulos encerrados e pagos',
  'monitor.activeTickets': 'Títulos ativos',
  'monitor.inProgressCount': '{count} em curso',
  'monitor.oldestFirst': 'Mais antigos primeiro',
  'monitor.seeAllTickets': 'Ver todos os títulos',
  'monitor.col.ticket': 'Título',
  'monitor.col.vehicle': 'Veículo',
  'monitor.col.area': 'Área',
  'monitor.col.entry': 'Entrada',
  'monitor.col.duration': 'Duração',
  'monitor.col.agent': 'Agente',
  'monitor.col.status': 'Estado',
  'monitor.col.action': 'Ação',
  'monitor.recordExit': 'Registar saída',
  'monitor.pageRange': '{from}–{to} de {total} títulos ativos',
  'monitor.page': 'Página {page} de {pages}',
  'monitor.recentActivity': 'Atividade recente',
  'monitor.recentActivitySub': 'Últimos eventos · rasto de auditoria',
  'monitor.fullHistory': 'Consultar histórico completo',

  // ── Event types (audit log) ──
  'event.ISSUE': 'Título emitido',
  'event.EXIT': 'Saída registada',
  'event.PAYMENT': 'Pagamento recebido',
  'event.PRINT': 'Impressão solicitada',
  'event.SMS': 'SMS enviado',
  'event.CORRECTION': 'Correção',
  'event.SIGN_IN': 'Entrada no sistema',
  'event.ADMIN_CHANGE': 'Alteração administrativa',
} as const;

export type MessageKey = keyof typeof pt;

const tet: Record<MessageKey, string> = {
  // ── Common ──
  appName: 'Estacionamento Dili',
  authorityName: 'Autoridade Municipal de Dili',
  'language.pt': 'Português',
  'language.tet': 'Tetum',
  'status.ATIVO': 'Ativu',
  'status.PAGO': 'Selu ona',
  'payment.CASH': 'Osan kontadu',
  'copy.WHITE': 'Mutin',
  'copy.YELLOW': 'Kinur',
  'copy.RED': 'Mean',
  'role.agent': 'Ajente',
  'role.supervisor': 'Supervizór',
  'role.finance': 'Finansas',
  'role.auditor': 'Auditór',
  'role.admin': 'Administradór',
  'unit.hours.one': '{n} oras',
  'unit.hours.other': '{n} oras',
  'unit.perHour': '{amount} / oras',
  currencyNote: 'Valór iha dólar amerikanu (USD).',

  // ── Agent: tabs ──
  'tab.home': 'Iníciu',
  'tab.newTicket': 'Títulu foun',
  'tab.history': 'Istóriku',

  // ── Agent: sign in (00) ──
  'agentLogin.subtitle': 'Tama ba ajente estasionamentu',
  'agentLogin.agentNumber': 'Númeru ajente',
  'agentLogin.pin': 'PIN (díjitu 6)',
  'agentLogin.submit': 'Tama',
  'agentLogin.forgotPin': 'Haluha PIN? Kontaktu supervizór',
  'agentLogin.offlineNote':
    "Laiha rede? Bele tama ho asesu ikus ne'ebé rai iha telemovel ida-ne'e. Títulu sira sei sinkroniza bainhira iha ligasaun.",
  'agentLogin.wrongPin': "PIN la loos. Tentativa ne'ebé sei iha: {remaining}",
  'agentLogin.locked': 'Konta blokeadu. Kontaktu supervizór.',

  // ── Agent: home (01) ──
  'home.parked': 'Estasionadu',
  'home.receivedToday': 'Simu ohin',
  'home.issueNew': 'Emite títulu foun',
  'home.parkedVehicles': 'Veíkulu estasionadu',
  'home.seeAll': 'Haree hotu · {count}',

  // ── Agent: new ticket (02) ──
  'newTicket.eyebrow': 'Estasionamentu · Emisaun',
  'newTicket.title': 'Títulu foun',
  'newTicket.intro': 'Identifika veíkulu atu loke rejistu estasionamentu.',
  'newTicket.plate': 'Matríkula veíkulu',
  'newTicket.vehicleType': 'Tipu veíkulu',
  'newTicket.issueData': 'Dadus emisaun',
  'newTicket.date': 'Data',
  'newTicket.entryTime': 'Oras tama',
  'newTicket.agent': 'Ajente',
  'newTicket.tariffNote': 'Tarifa: {amount}/h. Kobransa sura bainhira rejista sai.',
  'newTicket.copiesCount': 'Kópia dijitál 3',
  'newTicket.submit': 'Emite títulu estasionamentu',

  // ── Agent: ticket issued (03) ──
  'issued.eyebrow': 'Estasionamentu · Rejistu loke',
  'issued.title': 'Títulu emitidu',
  'issued.registeredAt': 'Emisaun rejista iha oras {time}',
  'issued.ticketHeading': 'Títulu Estasionamentu',
  'issued.dateEntry': 'Data / tama',
  'issued.issuingAgent': 'Ajente emisór',
  'issued.copies': 'Kópia dijitál 3',
  'issued.inRecord': 'Iha rejistu',
  'issued.recordExit': 'Rejista sai',

  // ── Agent: record exit (04) ──
  'exit.eyebrow': 'Estasionamentu · Kálkulu',
  'exit.title': 'Rejista sai',
  'exit.exitOn': 'Sai · {date}',
  'exit.entry': 'Tama',
  'exit.timeParked': 'Tempu estasionadu',
  'exit.hoursCharged': 'Oras kobra',
  'exit.tariff': 'Tarifa',
  'exit.paymentMethod': 'Métodu pagamentu',
  'exit.totalDue': 'Totál atu selu',
  'exit.ruleNote': "Oras ida ne'ebé hahú konta hanesan oras tomak ida: 1 h 45 min → 2 h.",
  'exit.confirm': 'Konfirma sai no pagamentu',

  // ── Agent: payment received (05) ──
  'receipt.eyebrow': 'Estasionamentu · Resibu',
  'receipt.title': 'Pagamentu simu ona',
  'receipt.receivedClosed': 'Simu ona · rejistu taka',
  'receipt.heading': 'Resibu pagamentu',
  'receipt.date': 'Data',
  'receipt.entryExit': 'Tama / sai',
  'receipt.hoursCharged': 'Oras kobra',
  'receipt.method': 'Métodu',
  'receipt.amountReceived': 'Valór simu',
  'receipt.agent': 'Ajente',
  'receipt.registeredAt': 'Pagamentu rejista iha oras {time}',
  'receipt.backHome': 'Fila ba iníciu',

  // ── Agent: history (06) ──
  'history.eyebrow': 'Estasionamentu · Auditoria',
  'history.title': 'Istóriku',
  'history.search': 'Matríkula ka númeru títulu',
  'history.filter.all': 'Hotu',
  'history.filter.active': 'Ativu',
  'history.filter.paid': 'Selu ona',
  'history.allTickets': 'Títulu hotu',
  'history.inProgress': "La'o hela",

  // ── Console: sign in ──
  'consoleLogin.title': 'Tama',
  'consoleLogin.subtitle': 'Supervizór, Finansas no Auditoria',
  'consoleLogin.username': 'Utilizadór',
  'consoleLogin.password': 'Liafuan-pase',
  'consoleLogin.smsCode': 'Kódigu verifikasaun (SMS)',
  'consoleLogin.submit': 'Tama ba konsola',
  'consoleLogin.forgotPassword': 'Haluha liafuan-pase?',
  'consoleLogin.auditNote': 'Asesu hotu rejista iha auditoria.',
  'consoleLogin.heroTitle': 'Konsola supervizaun',
  'consoleLogin.heroText': "Títulu, sai no simu osan husi área hotu, iha painél ida de'it.",

  // ── Console: navigation ──
  'nav.operations': 'Operasaun',
  'nav.monitoring': 'Monitorizasaun',
  'nav.activeTickets': 'Títulu ativu',
  'nav.newTicket': 'Títulu foun',
  'nav.history': 'Istóriku',
  'nav.payments': 'Pagamentu',
  'nav.audit': 'Auditoria',
  'nav.consoleName': 'Konsola supervizaun',

  // ── Console: monitoring (07) ──
  'monitor.eyebrow': 'Operasaun · Vizaun jerál',
  'monitor.title': 'Monitorizasaun iha tempu reál',
  'monitor.lastUpdate': 'Atualizasaun ikus',
  'monitor.refresh': 'Atualiza',
  'filter.area': 'Área',
  'filter.date': 'Data',
  'filter.agent': 'Ajente',
  'filter.allAreas': 'Área hotu',
  'filter.allAgents': 'Ajente hotu',
  'monitor.parkedVehicles': 'Veíkulu estasionadu',
  'monitor.receivedToday': 'Simu ohin',
  'monitor.paymentsCount': 'Pagamentu {count} rejistadu',
  'monitor.issuedToday': 'Títulu emite ohin',
  'monitor.issuedBreakdown': '{active} ativu + {paid} selu ona',
  'monitor.exits': 'Sai rejistadu',
  'monitor.exitsBreakdown': 'Títulu {count} taka no selu ona',
  'monitor.activeTickets': 'Títulu ativu',
  'monitor.inProgressCount': "{count} la'o hela",
  'monitor.oldestFirst': 'Tuan liu uluk',
  'monitor.seeAllTickets': 'Haree títulu hotu',
  'monitor.col.ticket': 'Títulu',
  'monitor.col.vehicle': 'Veíkulu',
  'monitor.col.area': 'Área',
  'monitor.col.entry': 'Tama',
  'monitor.col.duration': 'Durasaun',
  'monitor.col.agent': 'Ajente',
  'monitor.col.status': 'Estadu',
  'monitor.col.action': 'Asaun',
  'monitor.recordExit': 'Rejista sai',
  'monitor.pageRange': '{from}–{to} husi títulu ativu {total}',
  'monitor.page': 'Pájina {page} husi {pages}',
  'monitor.recentActivity': 'Atividade foin daudaun',
  'monitor.recentActivitySub': 'Eventu ikus · rastu auditoria',
  'monitor.fullHistory': 'Haree istóriku kompletu',

  // ── Event types (audit log) ──
  'event.ISSUE': 'Títulu emitidu',
  'event.EXIT': 'Sai rejistadu',
  'event.PAYMENT': 'Pagamentu simu ona',
  'event.PRINT': 'Impresaun husu',
  'event.SMS': 'SMS haruka ona',
  'event.CORRECTION': 'Korresaun',
  'event.SIGN_IN': 'Tama iha sistema',
  'event.ADMIN_CHANGE': 'Mudansa administrativa',
};

export const messages: Record<Locale, Record<MessageKey, string>> = { pt, tet };

export type MessageParams = Record<string, string | number>;

export function translate(locale: Locale, key: MessageKey, params?: MessageParams): string {
  const text = messages[locale][key];
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/** Translate in the default locale (Portuguese). */
export function t(key: MessageKey, params?: MessageParams): string {
  return translate(defaultLocale, key, params);
}

/** "1 hora", "2 horas" */
export function formatHours(locale: Locale, n: number): string {
  return translate(locale, n === 1 ? 'unit.hours.one' : 'unit.hours.other', { n });
}
