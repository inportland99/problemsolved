# Wavelength Party Game

A big-screen party game for a room full of people. The laptop drives a giant
dial on the TV; one person scans a QR code to privately see where the scoring
area is, and gives a clue.

- **Board (laptop / TV):** `/personal/wavelength/`
- **Clue giver (phone):** `/personal/wavelength/clue/` — reached by scanning the QR code

## Controls

```text
LEFT / RIGHT          = move needle
SHIFT + LEFT / RIGHT  = fine movement
SPACE                 = reveal
N                     = next round
F                     = fullscreen
R                     = reroll target
```

Also supported:

- `ENTER` — same as `SPACE` (reveal)
- `PAGE UP` / `PAGE DOWN` — same as left / right, so most presentation
  clickers work without any setup
- `Q` — enlarge the QR code (or just click it)

Tap an arrow key to nudge the needle; hold it down to glide continuously.
The needle locks once the round is revealed, so the score can't drift.

There are also small `◀ ▶ Reveal Next` buttons at the bottom of the screen
as a mouse/trackpad backup.

## How to play

1. Open `/personal/wavelength/` on the laptop and press `F` for fullscreen.
2. One person — the clue giver — scans the QR code in the bottom-right corner.
   Their phone shows the hidden scoring area for this round. Press `Q` first if
   you want to make the QR bigger for them.
3. They give a one-word (or one-phrase) clue that lands where the target is.
4. The room argues. You move the needle with the arrow keys.
5. Press `SPACE`. The scoring area animates in and the score appears.
6. Press `N` for a new spectrum, a new target, and a fresh QR code.

The clue giver's phone shows **no needle**, on purpose — so they can't watch
the room close in and unconsciously react.

## Scoring

The scoring area is 24% of the spectrum wide, centered on a random target:

```text
2 | 3 | 4 | 3 | 2
```

- **4 points** — within 2% of the center
- **3 points** — within 6%
- **2 points** — within 12%
- **0 points** — anywhere else

These widths are deliberately narrower than a standard Wavelength board, to
keep the needle honest. Tune them in `src/assets/js/wavelength/scoring.js`
(the `BANDS` array) if you want it easier or harder.

There is no running total. Each round is scored on its own; keep score out
loud if you want to.

## Adding your own spectrum prompts

Everything lives in one file:

```text
src/assets/js/wavelength/prompts.js
```

Add entries to the `PROMPTS` array:

```js
export const PROMPTS = [
  { left: 'Worthless', right: 'Priceless' },
  { left: 'Bad Pizza Topping', right: 'Great Pizza Topping' },
  // add yours here
  { left: 'Overrated Holiday', right: 'Underrated Holiday' },
];
```

Keep them short — they're rendered in very large type and read from across a
room. The game picks one at random each round and never repeats the same
spectrum twice in a row.

## Local development

```bash
npm install
npm start
```

Then open <http://localhost:8080/personal/wavelength/>.

To test the phone view against your real phone, note that the QR code encodes
`window.location.origin`, so on localhost it will point at
`http://localhost:8080/...` — which your phone can't reach. Either test the
clue page by clicking through in a second browser window, or run the dev
server bound to your LAN address:

```bash
npx eleventy --serve --port 8080
```

and browse to `http://<your-laptop-ip>:8080/personal/wavelength/`.

## Deployment

Nothing special. Push to `main` and the existing GitHub Actions workflow
builds the site and publishes it to GitHub Pages.

**There are no environment variables, no database, and no setup steps.**
The board holds the round in memory and hands it to the phone inside the QR
code's URL, so the whole game is a pair of static pages.

## Implementation notes

```text
src/personal/wavelength.njk        board page
src/personal/wavelength-clue.njk   phone page (permalink /personal/wavelength/clue/)
src/assets/css/wavelength.css      all styling for both views
src/assets/js/wavelength/
  scoring.js    pure scoring maths — bands, calculateScore, randomTarget
  prompts.js    the spectrum list (edit this one)
  round.js      builds a round; encodes/decodes it for the QR URL
  gauge.js      SVG semicircle geometry
  board.js      board controller
  clue.js       phone controller
  qr.js         QR rendering
```

The round travels to the phone in the URL hash:

```text
/personal/wavelength/clue/#3,Worthless,Priceless,0.4213
                           ^ round     ^ labels   ^ target (0.0-1.0)
```

The delimiter is a comma, not a pipe (`|`) — `|` isn't a legal URL character, and some phone camera apps silently percent-encode it to `%7C` before opening the link, which broke decoding on real phones.

Because the board redraws the QR on every `N` and `R`, re-scanning always
gives the current round. The phone does not update on its own — that's the
one trade-off for having no backend.

Positions are always normalized `0.0`–`1.0` (`0.0` = far left, `1.0` = far
right). Nothing is stored or scored in pixels; the dial converts a position
to an angle with `angle = -90 + position * 180`.
