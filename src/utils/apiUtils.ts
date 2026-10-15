/**
 * Helper per eseguire chiamate API fetch sicure verso gli endpoint backend.
 * Gestisce automaticamente i casi in cui il server restituisce pagine HTML
 * (es. 502 Bad Gateway da Cloud Run, 504 Gateway Timeout, 413 Payload Too Large, o fallback SPA di Vite)
 * prevenendo il classico errore JavaScript:
 * "Unexpected token '<', "<!doctype "... is not valid JSON"
 */

export async function safeFetchJson<T = any>(url: string, options?: RequestInit, retries = 2): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, options);
    } catch (netErr: any) {
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
        continue;
      }
      throw new Error(
        `Errore di connessione di rete (${netErr?.message || 'Server non raggiungibile'}). Verifica la tua connessione internet o riprova tra poco.`
      );
    }

    const contentType = response.headers.get('content-type') || '';

    // Se la risposta è formalmente JSON
    if (contentType.includes('application/json')) {
      let data: any;
      try {
        data = await response.json();
      } catch (parseErr: any) {
        throw new Error(`Errore di lettura dei dati JSON dal server: ${parseErr?.message}`);
      }

      if (!response.ok) {
        throw new Error(data?.error || `Errore del server (HTTP ${response.status})`);
      }
      return data as T;
    }

    // Se la risposta NON è JSON (es. HTML d'errore di rete, warmup di nginx o proxy)
    const rawText = await response.text();

    if (rawText.toLowerCase().includes('<!doctype') || rawText.toLowerCase().includes('<html')) {
      // Se il server è in fase di avvio/warmup o risveglio container, ritenta automaticamente prima di fallire
      if (attempt < retries && (response.status === 200 || response.status === 502 || response.status === 503 || response.status === 504)) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }

      if (response.status === 413) {
        throw new Error(
          "I file o screenshot inviati sono troppo voluminosi (Payload Too Large). Prova a utilizzare un'immagine più leggera o a ridurne la risoluzione."
        );
      }
      if (response.status === 502 || response.status === 503 || response.status === 504) {
        throw new Error(
          `Il server backend è temporaneamente non raggiungibile o in fase di avvio/risveglio su Cloud (HTTP ${response.status}). Riprova tra qualche istante.`
        );
      }
      if (response.status === 404) {
        throw new Error(
          `Rotta API non trovata (404) su "${url}". Il server backend potrebbe essere in fase di ricaricamento.`
        );
      }
      throw new Error(
        `Il server ha restituito una pagina web (HTML) invece di una risposta dati (HTTP ${response.status}). Il servizio potrebbe essere in fase di riavvio: attendi pochi secondi e riprova.`
      );
    }

    // Tenta comunque il parsing JSON nel caso in cui mancasse l'header Content-Type
    try {
      const parsed = JSON.parse(rawText);
      if (!response.ok) {
        throw new Error(parsed?.error || `Errore del server (HTTP ${response.status})`);
      }
      return parsed as T;
    } catch {
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
        continue;
      }
      throw new Error(
        `Risposta inattesa dal server (HTTP ${response.status}): ${rawText.slice(0, 100)}`
      );
    }
  }

  throw new Error('Impossibile completare la richiesta al server dopo vari tentativi.');
}
