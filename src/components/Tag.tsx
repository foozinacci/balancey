import type { CustomerTag } from '../types';

interface TagProps {
  tag: CustomerTag;
  size?: 'sm' | 'md';
}

const tagStyles: Record<CustomerTag, { bg: string; text: string; label: string }> = {
  LATE: { bg: 'bg-red-100', text: 'text-red-700', label: 'Late' },
  DO_NOT_ADVANCE: { bg: 'bg-red-100', text: 'text-red-700', label: 'No Advance' },
  VIP: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'VIP' },
  RELIABLE: { bg: 'bg-green-100', text: 'text-green-700', label: 'Reliable' },
  NEW: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'New' },
};

export function Tag({ tag, size = 'sm' }: TagProps) {
  const style = tagStyles[tag];
  const sizeStyles = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm';

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${style.bg} ${style.text} ${sizeStyles}`}
    >
      {style.label}
    </span>
  );
}
