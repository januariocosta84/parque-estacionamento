'use client';
// Agents get an agent number and 6-digit PIN; console users a username, password and phone (SMS code).
import { useState } from 'react';
import { ActionForm } from '../../../components/client';
import { inputClass, labelClass } from '../../../components/ui';
import { createUserAction } from './actions';

export interface CreateUserLabels {
  submit: string;
  role: string;
  name: string;
  agentNumber: string;
  pin: string;
  username: string;
  password: string;
  phone: string;
  areas: string;
  roles: Record<'agent' | 'supervisor' | 'finance' | 'auditor' | 'admin', string>;
}

export function CreateUserForm({
  labels,
  areas,
}: {
  labels: CreateUserLabels;
  areas: { id: string; name: string }[];
}) {
  const [role, setRole] = useState<keyof CreateUserLabels['roles']>('agent');
  const agent = role === 'agent';
  return (
    <ActionForm action={createUserAction} submit={labels.submit} className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label htmlFor="cu-role" className={labelClass}>
            {labels.role}
          </label>
          <select
            id="cu-role"
            name="role"
            value={role}
            onChange={(e) => setRole(e.target.value as typeof role)}
            className={inputClass}
          >
            {Object.entries(labels.roles).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <label htmlFor="cu-name" className={labelClass}>
            {labels.name}
          </label>
          <input id="cu-name" name="name" required className={inputClass} />
        </div>
        {agent ? (
          <>
            <div>
              <label htmlFor="cu-agent" className={labelClass}>
                {labels.agentNumber}
              </label>
              <input
                id="cu-agent"
                name="agentNumber"
                required
                placeholder="AMD-000"
                className={`${inputClass} font-mono uppercase`}
              />
            </div>
            <div>
              <label htmlFor="cu-pin" className={labelClass}>
                {labels.pin}
              </label>
              <input
                id="cu-pin"
                name="pin"
                required
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                className={`${inputClass} font-mono`}
              />
            </div>
          </>
        ) : (
          <>
            <div>
              <label htmlFor="cu-user" className={labelClass}>
                {labels.username}
              </label>
              <input
                id="cu-user"
                name="username"
                required
                autoComplete="off"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="cu-pass" className={labelClass}>
                {labels.password}
              </label>
              <input
                id="cu-pass"
                name="password"
                type="password"
                required
                minLength={12}
                autoComplete="new-password"
                className={inputClass}
              />
            </div>
          </>
        )}
        <div>
          <label htmlFor="cu-phone" className={labelClass}>
            {labels.phone}
          </label>
          <input
            id="cu-phone"
            name="phone"
            type="tel"
            required={!agent}
            placeholder="+670"
            className={inputClass}
          />
        </div>
      </div>
      <fieldset>
        <legend className={labelClass}>{labels.areas}</legend>
        <div className="flex flex-wrap gap-3">
          {areas.map((a) => (
            <label
              key={a.id}
              className="flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface px-4"
            >
              <input type="checkbox" name="areaIds" value={a.id} className="h-5 w-5 accent-red" />
              {a.name}
            </label>
          ))}
        </div>
      </fieldset>
    </ActionForm>
  );
}
