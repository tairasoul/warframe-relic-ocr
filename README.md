# warframe-relic-ocr

Simple program to sort owned relics by their rare item's median price on warframe.market, through screenshots provided.

To use, make a folder called imgs/ and put the images of your relic inventory in there. Do not include unowned relics.

`dist/all-items.js` filters by all items, instead of individual relics' rare items. Outputs each item, it's median price, highest order, and the relics it is in + chance.

`dist/rare-items-only.js` filters only by the relic's rare item.

The `Highest Order` price is obtained from the people currently ingame. Median is obtained from all buy orders, online, ingame or offline.

Makes use of `tesseract.js` and `warframe-items` npm packages.

The `example` directory shows how your images are supposed to look, and how the two different outputs will look.

Requiem relics are filtered out from the processing.
