// 83 -> "1:23"
export function formatDuration(seconds: number): string {
  const rest = Math.round(seconds % 60);
  return `${Math.floor(seconds / 60)}:${String(rest).padStart(2, '0')}`;
}
