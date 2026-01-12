/**
 * Loads and displays data from a specified API endpoint section.
 * 
 * Fetches JSON data from a path constructed as `/${name}/` and displays the result
 * in an output element with id `${name}-out`. The function handles loading states,
 * successful responses, and error cases.
 * 
 * @async
 * @param {string} name - The name of the section/endpoint to load. Used to construct both the fetch URL and the output element ID.
 * @returns {Promise<void>} A promise that resolves when the section has been loaded and displayed.
 * @throws {Error} Throws an error if the fetch request fails or returns a non-OK status.
 * 
 * @example
 * Fetches from '/users/' and displays result in element with id 'users-out'
 * await loadSection('users');
 */
async function loadSection(name) {
  const out = document.getElementById(`${name}-out`);
  out.textContent = `Fetching /${name}/ …`;
  try {
    console.log(`Fetching /${name}/ …`);
    const res = await fetch(`/${name}/`, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const json = await res.json();
    out.textContent = JSON.stringify(json, null, 2);
    console.log(`Received data for /${name}/:`, json);
  } catch (err) {
    out.textContent = `Error: ${err.message}`;
  }
}

function openDocs(name) {
  window.open(`/${name}/docs`, '_blank');
}
