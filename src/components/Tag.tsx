interface TagProps {
  tag: string;
  size?: 'sm' | 'md' | 'lg';
}

export function Tag({ tag, size = 'sm' }: TagProps) {
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm',
    lg: 'px-4 py-1.5 text-base',
  };

  const getTagClasses = () => {
    switch (tag) {
      case 'LATE':
        return 'tag-late';
      case 'VIP':
        return 'tag-vip';
      case 'NEW':
        return 'tag-new';
      case 'RELIABLE':
        return 'bg-gradient-to-r from-lime/20 to-lime-dim/20 text-lime border border-lime/30';
      case 'DO_NOT_ADVANCE':
        return 'tag-late'; // Same as late - danger color
      default:
        return 'bg-surface-600/50 text-silver border border-silver/20';
    }
  };

  return (
    <span className={`font-semibold rounded-full ${sizeClasses[size]} ${getTagClasses()}`}>
      {tag.replace(/_/g, ' ')}
    </span>
  );
}
