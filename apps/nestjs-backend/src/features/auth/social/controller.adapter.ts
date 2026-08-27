import type { Response } from 'express';
import type { IOauth2State } from '../../../cache/types';

// Reserved, non-routable origin used only as a URL-parse base. We then
// require `url.origin === base` so callers can only supply an absolute
// path or a path on this exact placeholder — relative URLs never escape
// to a foreign host. `.invalid` is an RFC 2606 TLD that must never
// resolve, so even a misconfigured deployment cannot reach it.
const REDIRECT_PARSE_BASE = 'http://__redirect_sandbox__.invalid';

function isValidRedirectPath(path: string): boolean {
  try {
    const url = new URL(path, REDIRECT_PARSE_BASE);
    return (
      url.origin === REDIRECT_PARSE_BASE && (url.protocol === 'http:' || url.protocol === 'https:')
    );
  } catch {
    return false;
  }
}

export class ControllerAdapter {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async authenticate() {}

  async callback(req: Express.Request, res: Response, defaultRedirectUri?: string) {
    const user = req.user!;
    // set cookie, passport login
    await new Promise<void>((resolve, reject) => {
      req.login(user, (err) => (err ? reject(err) : resolve()));
    });
    const redirectUri = (req.authInfo as { state: IOauth2State })?.state?.redirectUri;
    if (redirectUri && isValidRedirectPath(redirectUri)) {
      return res.redirect(redirectUri);
    }
    return res.redirect(defaultRedirectUri || '/');
  }
}
