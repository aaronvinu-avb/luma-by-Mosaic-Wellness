/**
 * Utility to export an array of objects to a CSV file.
 * Handles basic escaping and triggers a browser download.
 */
export function exportToCSV(data: Array<Record<string, unknown>>, filename: string) {
  if (!data || !data.length) return;

  const headers = Object.keys(data[0]);
  const csvRows = [];

  // Add the header row
  csvRows.push(headers.join(','));

  // Add the data rows
  for (const row of data) {
    const values = headers.map(header => {
      const val = row[header];
      const text = val == null ? '' : String(val);
      const escaped = text.replace(/"/g, '""'); // Escape double quotes
      return `"${escaped}"`; // Wrap in quotes to handle commas within values
    });
    csvRows.push(values.join(','));
  }

  const csvContent = csvRows.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
