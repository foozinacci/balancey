import type { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function Input({ label, className = '', ...props }: InputProps) {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-silver-light mb-2">
          {label}
        </label>
      )}
      <input
        className={`glass-input w-full ${className}`}
        {...props}
      />
    </div>
  );
}
