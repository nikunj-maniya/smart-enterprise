export function formatRelativeTime(iso: string) {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.floor(minutes)} min ago`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.floor(hours)} hr ago`;
  const days = hours / 24;
  if (days < 7) return `${Math.floor(days)} day${Math.floor(days) === 1 ? '' : 's'} ago`;
  const weeks = days / 7;
  if (weeks < 5) return `${Math.floor(weeks)} week${Math.floor(weeks) === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString();
}
