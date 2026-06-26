function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function AttendeeAvatar({ name }: { name: string }) {
  return (
    <div className="attendee-avatar" aria-hidden="true">
      {initialsFromName(name)}
    </div>
  );
}
