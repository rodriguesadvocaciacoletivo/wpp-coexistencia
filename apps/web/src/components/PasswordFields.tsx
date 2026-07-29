import { describePasswordPolicy, isPasswordAcceptable } from '@coexistente/shared';
import { Field, Input } from './ui';

export interface PasswordPair {
  password: string;
  confirmation: string;
}

/**
 * Par senha + confirmação, usado no aceite de convite e na redefinição.
 *
 * A validação vem do pacote compartilhado — a mesma função que o backend usa —
 * para que a interface nunca aceite algo que a API vá recusar.
 */
export function validatePasswordPair(pair: PasswordPair): string | null {
  if (!isPasswordAcceptable(pair.password)) {
    return describePasswordPolicy();
  }

  if (pair.password !== pair.confirmation) {
    return 'As senhas não conferem.';
  }

  return null;
}

export function PasswordFields({
  value,
  onChange,
  disabled,
}: {
  value: PasswordPair;
  onChange: (next: PasswordPair) => void;
  disabled?: boolean;
}) {
  const mismatch =
    value.confirmation.length > 0 && value.password !== value.confirmation;

  return (
    <>
      <Field label="Nova senha" htmlFor="password" hint={describePasswordPolicy()}>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          autoFocus
          disabled={disabled}
          value={value.password}
          onChange={(event) =>
            onChange({ ...value, password: event.target.value })
          }
        />
      </Field>

      <Field
        label="Confirme a senha"
        htmlFor="confirmation"
        error={mismatch ? 'As senhas não conferem.' : null}
      >
        <Input
          id="confirmation"
          type="password"
          autoComplete="new-password"
          required
          disabled={disabled}
          value={value.confirmation}
          onChange={(event) =>
            onChange({ ...value, confirmation: event.target.value })
          }
        />
      </Field>
    </>
  );
}
