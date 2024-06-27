# warframe-relic-ocr

Simple program to sort owned relics by their rare item's median price on warframe.market, through screenshots provided.

To use, make a folder (or run node dist/main.js once) called imgs/ and put the images of your relic inventory in there. Do not include unowned relics.

Run `node dist/main.js`, and you'll get the regular output alongside a filtered output (filtered.txt) in output/

The only difference is filtered.txt is ordered by median price, and includes the median price.

Makes use of `tesseract.js` and `warframe-items` npm packages.
