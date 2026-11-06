import { homeScreenApp, openLinksInSafari, safariUrl } from './external-links';

const IPHONE_17 =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const IPHONE_16 = IPHONE_17.replace('17_0', '16_7');
const IPAD =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15';

/** Opened from the Home Screen (or not), on that device and with that many touch points. */
function device(userAgent: string, standalone: boolean | undefined, touchPoints: number) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
  // jsdom has neither.
  Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: touchPoints });
  Object.defineProperty(navigator, 'standalone', { configurable: true, value: standalone });
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const name of ['maxTouchPoints', 'standalone']) Reflect.deleteProperty(navigator, name);
  document.body.replaceChildren();
});

describe('safariUrl', () => {
  const origin = 'https://sabores.drackp2m.dev';

  it('sends other sites to Safari, as they are', () => {
    expect(safariUrl('https://www.instagram.com/origen_castellon', origin)).toBe(
      'x-safari-https://www.instagram.com/origen_castellon',
    );
    expect(safariUrl('https://www.openstreetmap.org/copyright?a=1#b', origin)).toBe(
      'x-safari-https://www.openstreetmap.org/copyright?a=1#b',
    );
    expect(safariUrl('http://example.com/', origin)).toBe('x-safari-http://example.com/');
  });

  it("leaves the app's own pages, Apple Maps and what isn't a web page", () => {
    expect(safariUrl(`${origin}/data/venues.json`, origin)).toBeNull();
    expect(safariUrl('https://maps.apple.com/?daddr=39.98,-0.03', origin)).toBeNull();
    expect(safariUrl('tel:641986169', origin)).toBeNull();
    expect(safariUrl('mailto:a@b.c', origin)).toBeNull();
    expect(safariUrl('x-safari-https://example.com/', origin)).toBeNull();
    expect(safariUrl('not a url', origin)).toBeNull();
  });
});

describe('homeScreenApp', () => {
  it('is an iPhone or iPad on iOS 17 or later, opened from the Home Screen', () => {
    device(IPHONE_17, true, 5);
    expect(homeScreenApp()).toBe(true);
    device(IPAD, true, 5);
    expect(homeScreenApp()).toBe(true);
  });

  it('not in Safari, on a Mac, nor before iOS 17', () => {
    device(IPHONE_17, false, 5);
    expect(homeScreenApp()).toBe(false);
    device(IPHONE_17, undefined, 5);
    expect(homeScreenApp()).toBe(false);
    device(IPAD, true, 0);
    expect(homeScreenApp()).toBe(false);
    device(IPHONE_16, true, 5);
    expect(homeScreenApp()).toBe(false);
  });
});

describe('openLinksInSafari', () => {
  /** A link with that address, on the page, with an icon inside (where the finger lands). */
  function link(href: string): SVGSVGElement {
    const a = document.createElement('a');
    a.href = href;
    a.target = '_blank';
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    a.append(icon, 'texto');
    document.body.append(a);
    return icon;
  }

  function tap(target: Element, init: MouseEventInit = {}): MouseEvent {
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event;
  }

  it("from the Home Screen, opens other sites' links in Safari instead of the app", () => {
    device(IPHONE_17, true, 5);
    const navigate = vi.fn();
    const stop = openLinksInSafari(navigate);

    const event = tap(link('https://www.instagram.com/origen_castellon'));
    expect(event.defaultPrevented).toBe(true);
    expect(navigate).toHaveBeenCalledExactlyOnceWith(
      'x-safari-https://www.instagram.com/origen_castellon',
    );

    stop();
    expect(tap(link('https://openfreemap.org/')).defaultPrevented).toBe(false);
    expect(navigate).toHaveBeenCalledOnce();
  });

  it("even if the link's own listeners stop the click", () => {
    device(IPHONE_17, true, 5);
    const navigate = vi.fn();
    const stop = openLinksInSafari(navigate);
    const icon = link('https://openfreemap.org/');
    icon.parentElement!.addEventListener('click', (event) => event.stopPropagation());

    tap(icon);
    expect(navigate).toHaveBeenCalledExactlyOnceWith('x-safari-https://openfreemap.org/');
    stop();
  });

  it('leaves the rest of the taps alone', () => {
    device(IPHONE_17, true, 5);
    const navigate = vi.fn();
    const stop = openLinksInSafari(navigate);

    expect(tap(link('tel:641986169')).defaultPrevented).toBe(false);
    expect(tap(link(`${location.origin}/data/venues.json`)).defaultPrevented).toBe(false);
    expect(tap(link('https://example.com/'), { metaKey: true }).defaultPrevented).toBe(false);
    expect(tap(link('https://example.com/'), { button: 1 }).defaultPrevented).toBe(false);
    const button = document.createElement('button');
    document.body.append(button);
    expect(tap(button).defaultPrevented).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    stop();
  });

  it('in Safari, the links open as usual', () => {
    device(IPHONE_17, false, 5);
    const navigate = vi.fn();
    const stop = openLinksInSafari(navigate);

    expect(tap(link('https://www.instagram.com/origen_castellon')).defaultPrevented).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    stop();
  });
});
