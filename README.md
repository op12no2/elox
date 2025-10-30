# elox
Aggregated chess engine ratings. Experimental. Feasability test. Design choice - all text data, easily collaborative.

[index.htm](https://op12no2.github.io/elox) is generated from the data in /dat/* via src/flatten.js and template.htm.

data/engines.json is a list of engines - created and maintaind by hand but automation possible.

dat/sources.json is a list of rating sources maintained by hand.

dat/eval.json is a list of evaluation techniques maintained by hand.

dat/search.json is a list of search techniques maintained by hand.

dat/ratings is a directory containing rating values for each source in sources.json; e.g. ccrl40.json. These can be maintained by web scraping. Currently two have been created by hand with a few of values.

Ratings in these files are of the form: engine, build, elo, date.

Rows are displayed for each engine+build combination flatten.js finds accross all the sources. Latest values only at present.

Columns are displayed for engine peoperties and each rating source.

To add a new rating source just tweak sources.json and add a new file in dat/ratings and everythign else is auto (a new column will appear). Would also need a new web scraper to get the values in src unless maintained by hand.

Columns can be sorted and filtered to find the best HCE or MCTS engine easily for example. Multi column sort.

flatten.js can be auto-run as an action whenever one of the data files changes.

Obviously the page would be far richer than it is now with approprate links and tooltips etc.

Should the rating values include number of games?

What other engines properties would be useful columns? datagen for example?

Is this useful at all?

CCRL is easy to scrape - are other lists practical too?

Scrapers can be run auto every day or something?

Need to be able to get a URL to current UI options.



