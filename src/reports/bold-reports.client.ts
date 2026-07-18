import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Talks to a Bold Reports® (Syncfusion) Report Server over its REST API to
 * render the published grounding-report .rdl template with this app's
 * calculation data and get back an exported file (PDF/Word/Excel).
 *
 * Bold Reports doesn't ship a Node.js SDK for headless/server-side
 * rendering — `@boldreports/javascript-reporting-controls` and the
 * `bold-reports` npm package are browser controls (ReportViewer /
 * ReportDesigner) that need jQuery + a DOM, and the headless
 * `BoldReports.Writer.ReportWriter` export API is .NET-only. For a NestJS
 * backend the supported integration is a self-hosted or Bold Reports Cloud
 * **Report Server**, called over HTTP — which is what this class does.
 *
 * ── What's verified vs. not ──────────────────────────────────────────
 * The auth flow below (`getAccessToken`) is documented and confirmed:
 * `POST {domain}/reporting/api/token` with an OAuth2 "password" grant
 * returns a bearer `access_token`, which is then sent as
 * `Authorization: Bearer <token>` on subsequent calls. The base URL
 * pattern `{domain}/reporting/api/site/{site}/...` for site-scoped
 * resource endpoints is also documented.
 *
 * The exact JSON payload shape for exporting a *published* report item to
 * a file is on a version of that REST reference I couldn't load (the page
 * returned a bot-detection block rather than content), so `exportReport`
 * below targets the documented URL *pattern* with the most standard
 * shape (`POST .../resources/content?path=...&format=...` with a JSON
 * `{ parameters }` body) but this one call should be verified against
 * your own site's interactive API docs
 * (`{domain}/reporting/api/site/{site}/swagger`, or the "Try It Now" link
 * for your server's API version) before relying on it in production —
 * everything else in this module (auth, storage, entities, ownership
 * checks) does not depend on that shape being exactly right.
 */
@Injectable()
export class BoldReportsClient {
  private cachedToken: { accessToken: string; expiresAt: number } | null = null;

  constructor(private readonly config: ConfigService) {}

  private get domain(): string {
    // No trailing slash expected, e.g. https://reports.example.com
    return this.config.getOrThrow<string>('BOLD_REPORTS_DOMAIN');
  }

  private get site(): string {
    return this.config.getOrThrow<string>('BOLD_REPORTS_SITE');
  }

  private get templatePath(): string {
    return this.config.getOrThrow<string>('BOLD_REPORTS_TEMPLATE_PATH');
  }

  /**
   * OAuth2 "password" grant against the Report Server's token endpoint.
   * Confirmed flow — see class doc comment.
   */
  private async getAccessToken(): Promise<string> {
    // 5s safety margin so a token doesn't expire mid-request.
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now() + 5000) {
      return this.cachedToken.accessToken;
    }

    const username = this.config.getOrThrow<string>('BOLD_REPORTS_USERNAME');
    const password = this.config.getOrThrow<string>('BOLD_REPORTS_PASSWORD');

    let response: Response;
    try {
      response = await fetch(`${this.domain}/reporting/api/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'password',
          username,
          password,
        }),
      });
    } catch {
      throw new InternalServerErrorException(
        'اتصال به سرور گزارش‌ساز (Bold Reports) برقرار نشد.',
      );
    }

    if (!response.ok) {
      throw new InternalServerErrorException(
        `احراز هویت سرور گزارش‌ساز ناموفق بود (Bold Reports: ${response.status}).`,
      );
    }

    const body = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };

    this.cachedToken = {
      accessToken: body.access_token,
      expiresAt: Date.now() + body.expires_in * 1000,
    };

    return this.cachedToken.accessToken;
  }

  /**
   * Renders the configured `BOLD_REPORTS_TEMPLATE_PATH` .rdl template with
   * `parameters` as its data source and returns the exported file bytes.
   *
   * See the class doc comment: the request shape here is the standard
   * pattern for this API family, not independently confirmed against this
   * exact server version — verify against your site's own API docs if
   * exports start failing.
   */
  async exportReport(
    parameters: Record<string, unknown>,
    format: 'PDF' | 'Word' | 'Excel' = 'PDF',
  ): Promise<Buffer> {
    const accessToken = await this.getAccessToken();
    const url = new URL(
      `${this.domain}/reporting/api/site/${this.site}/resources/content`,
    );
    url.searchParams.set('path', this.templatePath);
    url.searchParams.set('format', format);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ parameters }),
      });
    } catch {
      throw new InternalServerErrorException(
        'اتصال به سرور گزارش‌ساز (Bold Reports) برقرار نشد.',
      );
    }

    if (!response.ok) {
      throw new InternalServerErrorException(
        `تولید گزارش ناموفق بود (Bold Reports: ${response.status}).`,
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
