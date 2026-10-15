import { describe, expect, it } from 'vitest';
import { FonnteSender, normalizePhone } from './sms';

describe('normalizePhone (Fonnte wants the full international number)', () => {
  it.each([
    ['+670 7700 0001', '67077000001'],
    ['67077000001', '67077000001'],
    ['77000001', '67077000001'], // Timor-Leste mobile without country code
    ['0077000001', '67077000001'], // leading zeros dropped
    ['+62 812 3456 789', '628123456789'], // other countries kept as given
  ])('%j → %s', (input, expected) => {
    expect(normalizePhone(input, '670')).toBe(expected);
  });

  it('rejects text that is not a phone number', () => {
    expect(normalizePhone('abc', '670')).toBeNull();
    expect(normalizePhone('', '670')).toBeNull();
  });
});

describe('FonnteSender', () => {
  function fakeFetch(status: number, body: unknown) {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchFn = async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(body), { status });
    };
    return { calls, fetchFn };
  }

  it('posts target, message and countryCode 0 with the token as Authorization', async () => {
    const { calls, fetchFn } = fakeFetch(200, {
      status: true,
      detail: 'success! message in queue',
      id: ['1'],
    });
    await new FonnteSender('secret-token', '670', fetchFn).send('+670 7700 0001', 'Código 123456');

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://api.fonnte.com/send');
    expect(calls[0]!.init.method).toBe('POST');
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe('secret-token');
    const form = calls[0]!.init.body as FormData;
    expect(form.get('target')).toBe('67077000001');
    expect(form.get('message')).toBe('Código 123456');
    expect(form.get('countryCode')).toBe('0');
  });

  it('fails when Fonnte reports status false (either spelling)', async () => {
    for (const body of [
      { status: false, reason: 'insufficient quota' },
      { Status: false, reason: 'token invalid' },
    ]) {
      const { fetchFn } = fakeFetch(200, body);
      await expect(new FonnteSender('t', '670', fetchFn).send('77000001', 'x')).rejects.toThrow(
        body.reason,
      );
    }
  });

  it('fails on an HTTP error or when the user has no usable phone', async () => {
    const { fetchFn } = fakeFetch(500, {});
    await expect(new FonnteSender('t', '670', fetchFn).send('77000001', 'x')).rejects.toThrow(
      /HTTP 500/,
    );
    await expect(new FonnteSender('t', '670', fetchFn).send(null, 'x')).rejects.toThrow(
      /no phone/i,
    );
  });

  it('accepts Fonnte’s "Status" spelling for success too', async () => {
    const { fetchFn } = fakeFetch(200, { Status: true });
    await expect(
      new FonnteSender('t', '670', fetchFn).send('77000001', 'x'),
    ).resolves.toBeUndefined();
  });
});
