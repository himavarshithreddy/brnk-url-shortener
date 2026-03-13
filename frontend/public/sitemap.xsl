<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:sm="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
  exclude-result-prefixes="sm image">

  <xsl:output method="html" version="1.0" encoding="UTF-8" indent="yes" />

  <xsl:template match="/">
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>BRNK — XML Sitemap</title>
        <meta name="robots" content="noindex, follow" />
        <style>
          :root {
            --orange: #ff6600;
            --orange-dim: #cc5200;
            --bg: #1a1a1a;
            --surface: #242424;
            --border: #333333;
            --text: #f0f0f0;
            --muted: #999999;
            --radius: 6px;
          }

          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

          body {
            background: var(--bg);
            color: var(--text);
            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
            font-size: 15px;
            line-height: 1.6;
            padding: 2rem 1rem 4rem;
          }

          a { color: var(--orange); text-decoration: none; }
          a:hover { text-decoration: underline; color: var(--orange-dim); }

          .container { max-width: 960px; margin: 0 auto; }

          /* Header */
          header {
            display: flex;
            align-items: center;
            gap: 1rem;
            border-bottom: 2px solid var(--orange);
            padding-bottom: 1.25rem;
            margin-bottom: 2rem;
          }

          .logo {
            font-size: 1.6rem;
            font-weight: 800;
            letter-spacing: -0.5px;
            color: var(--orange);
            background: none;
            border: 3px solid var(--orange);
            padding: 0.15rem 0.6rem;
            border-radius: var(--radius);
          }

          header p {
            color: var(--muted);
            font-size: 0.9rem;
          }

          /* Stats bar */
          .stats {
            display: flex;
            gap: 1.5rem;
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            padding: 0.9rem 1.25rem;
            margin-bottom: 1.75rem;
            font-size: 0.9rem;
          }

          .stats span { color: var(--muted); }
          .stats strong { color: var(--orange); margin-left: 0.3rem; }

          /* Table */
          table {
            width: 100%;
            border-collapse: collapse;
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            overflow: hidden;
          }

          thead { background: #2e2e2e; }

          th {
            text-align: left;
            padding: 0.75rem 1rem;
            font-size: 0.78rem;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: var(--muted);
            border-bottom: 1px solid var(--border);
          }

          td {
            padding: 0.85rem 1rem;
            border-bottom: 1px solid var(--border);
            vertical-align: middle;
            font-size: 0.9rem;
          }

          tbody tr:last-child td { border-bottom: none; }
          tbody tr:hover { background: #2a2a2a; }

          .priority-badge {
            display: inline-block;
            padding: 0.15rem 0.55rem;
            border-radius: 999px;
            font-size: 0.78rem;
            font-weight: 700;
          }

          .priority-high {
            background: rgba(255, 102, 0, 0.18);
            color: var(--orange);
            border: 1px solid rgba(255, 102, 0, 0.35);
          }

          .priority-med {
            background: rgba(255, 200, 0, 0.12);
            color: #ffc800;
            border: 1px solid rgba(255, 200, 0, 0.3);
          }

          .changefreq { color: var(--muted); font-size: 0.85rem; }

          .url-cell { word-break: break-all; }

          /* Footer */
          footer {
            margin-top: 2.5rem;
            text-align: center;
            color: var(--muted);
            font-size: 0.82rem;
          }

          footer a { color: var(--muted); }
          footer a:hover { color: var(--orange); }

          @media (max-width: 600px) {
            .col-freq, .col-mod { display: none; }
            .stats { flex-wrap: wrap; gap: 0.75rem; }
          }
        </style>
      </head>
      <body>
        <div class="container">

          <header>
            <span class="logo">BRNK</span>
            <div>
              <strong>XML Sitemap</strong>
              <p>This sitemap is used by search engines to discover all public pages on <a href="https://brnk.vercel.app/">brnk.vercel.app</a>.</p>
            </div>
          </header>

          <div class="stats">
            <div>
              <span>Total URLs</span>
              <strong><xsl:value-of select="count(sm:urlset/sm:url)" /></strong>
            </div>
            <div>
              <span>Generated for</span>
              <strong>brnk.vercel.app</strong>
            </div>
            <div>
              <span>Format</span>
              <strong>Sitemaps 0.9 + Image Extension</strong>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>URL</th>
                <th class="col-mod">Last Modified</th>
                <th class="col-freq">Change Frequency</th>
                <th>Priority</th>
              </tr>
            </thead>
            <tbody>
              <xsl:for-each select="sm:urlset/sm:url">
                <xsl:sort select="sm:priority" order="descending" data-type="number" />
                <tr>
                  <td><xsl:value-of select="position()" /></td>
                  <td class="url-cell">
                    <a href="{sm:loc}">
                      <xsl:value-of select="sm:loc" />
                    </a>
                  </td>
                  <td class="col-mod changefreq">
                    <xsl:value-of select="sm:lastmod" />
                  </td>
                  <td class="col-freq changefreq">
                    <xsl:value-of select="sm:changefreq" />
                  </td>
                  <td>
                    <xsl:choose>
                      <xsl:when test="sm:priority >= 0.9">
                        <span class="priority-badge priority-high">
                          <xsl:value-of select="sm:priority" />
                        </span>
                      </xsl:when>
                      <xsl:otherwise>
                        <span class="priority-badge priority-med">
                          <xsl:value-of select="sm:priority" />
                        </span>
                      </xsl:otherwise>
                    </xsl:choose>
                  </td>
                </tr>
              </xsl:for-each>
            </tbody>
          </table>

          <footer>
            <p>
              <a href="https://brnk.vercel.app/">BRNK</a> — Free URL Shortener &amp; QR Code Generator ·
              <a href="https://www.sitemaps.org/protocol.html">Sitemaps protocol</a>
            </p>
          </footer>

        </div>
      </body>
    </html>
  </xsl:template>

</xsl:stylesheet>
