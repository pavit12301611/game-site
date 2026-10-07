/**
 * Recovery screen: shown when render() throws.
 */

export function renderFatal(error) {
  return `
    <div class="fatal-screen">
      <h1>Something went wrong</h1>
      <p>The page could not be drawn. This is a bug — refreshing usually fixes it.</p>
      <pre class="fatal-error">${String(error?.message || error || 'Unknown error')}</pre>
      <button class="btn btn-primary" onclick="location.reload()">Reload the page</button>
    </div>
  `;
}