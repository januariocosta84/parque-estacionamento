'use client';
import { useActionState } from 'react';
import { CodeInput } from '../../components/client';
import { buttonClass, inputClass, labelClass } from '../../components/ui';
import { loginAction } from './actions';
import type { LoginState } from './actions';

export interface LoginLabels {
  username: string;
  password: string;
  smsCode: string;
  submit: string;
  codeSent: string;
  back: string;
  forgotPassword: string;
}

export function LoginForm({ labels }: { labels: LoginLabels }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {
    step: 'password',
  });

  return (
    <form action={action} className="grid gap-5">
      <input type="hidden" name="step" value={state.step} />
      {state.step === 'password' ? (
        <>
          <div>
            <label htmlFor="username" className={labelClass}>
              {labels.username}
            </label>
            <input
              id="username"
              name="username"
              autoComplete="username"
              defaultValue={state.username}
              required
              className={`${inputClass} min-h-14 text-lg`}
            />
          </div>
          <div>
            <label htmlFor="password" className={labelClass}>
              {labels.password}
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className={`${inputClass} min-h-14 text-lg`}
            />
          </div>
        </>
      ) : (
        <>
          <input type="hidden" name="username" value={state.username ?? ''} />
          <p className="rounded-xl bg-green-soft px-4 py-3 text-[15px] text-green">
            {labels.codeSent}
          </p>
          <CodeInput name="code" label={labels.smsCode} />
        </>
      )}

      <button
        type="submit"
        disabled={pending}
        className={`${buttonClass.primary} min-h-14 text-lg`}
      >
        {labels.submit}
      </button>
      {state.error ? (
        <p role="alert" className="text-[15px] font-semibold text-red">
          {state.error}
        </p>
      ) : null}
      {state.step === 'password' ? (
        <p className="text-[15px] font-semibold text-red">{labels.forgotPassword}</p>
      ) : null}
    </form>
  );
}
