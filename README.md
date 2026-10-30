# Kč Basket

Tell it what you want to buy, by typing items or pasting a recipe, and it shows where each thing is cheapest across Tesco, Albert and Lidl. It also shows the cheapest single shop, and whether splitting between two shops is worth it.

The app runs on your phone. Your list, recipes, price book and budget stay on the device. A small job on GitHub reads prices once a day and saves them next to the app.

## Where the prices come from

| Shop | What the app knows | Source |
|---|---|---|
| Tesco | The online price of every item in the built-in dictionary (about 190), plus your own items, with Clubcard prices and offers | nakup.itesco.cz, every morning |
| Albert, Lidl | This week's leaflet deals only | kupi.cz, every morning |
| Usual prices | kupi.cz's "Běžná cena" for products on offer, used to check whether an offer is a real saving | kupi.cz product pages, up to 200 a morning, each kept for 30 days |
| Any shop | Prices you log, read from receipts, or confirm when you finish a shop | your price book |

Albert and Lidl don't publish their full shelf prices anywhere, so for everyday items that aren't on offer, the app relies on your price book. Reading a couple of receipts fills it quickly.

Tesco's online prices can differ from its Express stores, so they're labelled "Tesco online". Kaufland, Penny and Billa leaflets are read too, and can be turned on in Settings.

## Put it online once (GitHub Pages, free)

1. Create a new **public** repository on github.com, for example `Basket`. The code and the price data are public. Your list and everything else you enter never leave your phone.
2. Choose **Add file → Upload files**. Drag in everything from this folder, including the `.github`, `data`, `fetch`, `icons`, `js` and `ocr` folders, and commit. Leave out `fetch/node_modules` if it's there.
3. Check that a `.github` folder now shows on the repository's front page. Finder hides folders whose names start with a dot (press **Cmd+Shift+.** to show them). If it's missing, choose **Add file → Create new file**, name it `.github/workflows/prices.yml`, paste in the contents of `fetch/workflow-prices.yml`, and commit.
4. Go to **Settings → Pages**, set **Source** to *Deploy from a branch*, choose `main` and `/ (root)`, and save.
5. Open the **Actions** tab, choose **Prices**, and press **Run workflow**. The first run takes about ten minutes. After that it runs every morning at about 06:17.
6. The app is at `https://<your-username>.github.io/<repository-name>/`, for example `https://jonovanvanyken-lab.github.io/Basket/`.

## Install on your phone

- **iPhone:** open the link in Safari or Chrome → Share → **Add to Home Screen**.
- **Android:** open the link in Chrome → ⋮ menu → **Install app**.

## Using it

- **List.** Type items in English or Czech ("eggs, butter 500 g, 1 kg chicken thighs"), tap your staples, or paste a recipe. Tick what you already have at home.
- **Plan.** Shows three totals: cheapest for each item, cheapest single shop, and the best two-shop split. The split is only suggested when it saves more than your threshold (80 Kč to start with, changeable in Settings). Each price says where it came from and how fresh it is. It also flags card or app prices and whether a price is the lowest in eight weeks. Swap ideas, such as frozen spinach for fresh, appear when they save at least 15 %.
- **Shop.** A checklist sorted by shop and aisle that works without signal. **Finish at …** logs what you paid in Budget and lets you correct shelf prices into the price book.
- **Deals.** *For you* lists offers on your staples, your list and your recipes, ending soonest first. *All deals* lets you browse by shop and category. *Cook* shows the cheapest protein and veg this week, and which of your recipes use them.
- **Recipes.** Saved recipes show their cost per serving at today's prices. *Add to list* scales them to any number of servings.
- **Menu (☰).** Price book, receipt reading, budget, staples and pantry, price history, price data status and settings.

Tap any item to see every shop's price, choose a specific brand per shop, log a price, or see its price history.

## English names and photos

Product, deal and receipt names show in English, with the Czech name in small grey text underneath, which helps on the shelf. Tesco products show their photo. Leaflet deals have no photos, so they show an icon for the item. Both can be switched off in **Settings → Names and photos**. Photos are kept on the phone, so the shopping list still shows them without signal.

Out of the box the English comes from a built-in grocery glossary, word for word ("Kuřecí prsní řízky" → "Chicken breast schnitzels"). For natural translations, add a free DeepL key:

1. Sign up for **DeepL API Free** at deepl.com/pro-api. It asks for a card to confirm who you are, but the free plan isn't charged. Copy your key from **Account → API Keys**. It ends in `:fx`.
2. In your GitHub repository: **Settings → Secrets and variables → Actions → New repository secret**. Name it `DEEPL_KEY` and paste the key.

From the next daily run, every new name is translated once and saved in `data/translations.json`. The free allowance (500,000 characters a month) covers this comfortably. If it ever runs out, the glossary fills in until it resets.

## Deals

- **For you** lists offers on your staples, list, recipes and alert items, plus anything that mentions one of your **watch words** (brands or products, such as "Nutella" or "Pilsner"). The Deals tab shows a count of offers you haven't seen yet.
- **All deals** lets you choose any mix of shops and categories, sort by % off, saving in Kč, value against Tesco online, price per kg or litre, price, ending soonest, newest or A–Z, and switch between one list and grouped by shop. **More filters** covers minimum discount, card or app deals, timing (on now, ending soon, starting later), hiding offers that cost more than Tesco online, stock-up deals, new deals, and categories to hide everywhere. Your choices are remembered.
- **Usual price:** where kupi.cz lists a usual price ("Běžná cena") for the same product and pack size (read from its product pages, up to 200 new ones each morning, starting with your alert items, so coverage grows over the first week or two), the deal shows it, how far below it the offer is, and the saving in Kč. Offers that cost more than the usual price are flagged *Above usual price*. Products sold in several sizes only get a usual price when kupi.cz makes clear which size it's for.
- **Labels on each deal:** *New* (appeared in the last two days), *Stock up* (keeps well and is the lowest price in 8 weeks), *x % under Tesco* or *Tesco online cheaper* (compared with Tesco online's cheapest everyday price for the same item), and the saving in Kč.
- **Tap a deal** for the details: the same item at every shop, other pack sizes, adding it to your list with a quantity, alerts for that item, watching its brand, and a link to the deal on kupi.cz.

## Sale alerts (push notifications)

Every morning, after reading prices, the job sends one notification listing anything on your alert list that has gone on offer. It covers your staples (optional), items you've switched on, any watch words, and items under a target price you set. Each offer is only mentioned once.

It needs the GitHub connection (below), an iPhone on iOS 16.4 or later, and the app opened from its Home Screen icon. To set it up:

1. If you uploaded the app before sale alerts existed, update the workflow file. On GitHub open `.github/workflows/prices.yml`, click the pencil, replace everything with the contents of `fetch/workflow-prices.yml`, and commit.
2. In the app: **Menu → Sale alerts → Turn on sale alerts**, and allow notifications.
3. Copy the setup code it shows. On GitHub: **Settings → Secrets and variables → Actions → New repository secret**, name it `PUSH_CONFIG`, paste, and **Add secret**.
4. Back in the app, press **Send a test notification**. It arrives within a minute or two.

The setup code holds this phone's notification address and the keys to sign messages to it. It stays in the secret, which only the job can read. Your alert list is saved as `data/alerts.json`, which is visible in the public repository.

## The GitHub connection (optional)

Without it, the app works from the daily prices. With it, you can press **Fetch now**, read recipe links, and give your own items (ones not in the dictionary) their own Tesco search straight away.

1. On GitHub: **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. **Repository access:** *Only select repositories* → your Basket repository.
3. **Permissions:** *Actions: Read and write* and *Contents: Read and write*.
4. In the app, open **Menu → Settings → GitHub connection** and enter your username, the repository name and the token.

The token is stored only on that device and isn't included in backups. Because the repository is public, the extra searches (in `data/watch.json`) and any recipe links you read are visible there too.

## If prices stop arriving

Open **Menu → Price data**. It shows when each source was last read, and how.

- **Tesco** is read through Tesco's own search API, or the search page if that fails. If both are refused from GitHub's servers, you can run the job on your own computer instead: `cd fetch && npm install && node fetch.mjs`, then upload the changed `data` folder. If Tesco changes its public API key, add the new one as a repository secret called `TESCO_API_KEY`.
- **Leaflets** come from kupi.cz. If one shop's page changes, the app keeps that shop's last good deals until they expire.

The job waits one to two seconds between pages and runs once a day. It only loads pages that kupi.cz's robots.txt allows for automated tools: the shop and category listings, and product pages for usual prices. It doesn't use kupi.cz's search, which refuses automated requests. It reads the same public pages a shopper sees. Their terms don't invite automated reading, so keep it to personal use.

## Your data

Everything you enter is stored in this browser on this device. **Menu → Settings → Backup** saves it all as one file. The budget export (CSV) is for checking against Kč Ledger. Your card payments already reach Ledger through your bank file, so don't import the export there as new entries.

## Tests

`npm test` runs the parsing, matching, planning and price-job tests (Node 22). The price-job test runs the whole job against saved pages, with no network.

## Credits

Text recognition: tesseract.js (Apache 2.0), in `ocr/`. HTML parsing in the price job: node-html-parser (MIT). Prices: Tesco (nakup.itesco.cz) and kupi.cz.
