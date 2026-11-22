# Changelog

What each release of Notebooks brought. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). A release names the
Omabook it needs.

## [Unreleased]

### Changed

- A page open is the whole view (#14): the notebooks, the paper pickers and the title fold away, and the page
  fits the height, its zoom kept from page to page. The tools are a slim column in the page's margin, each a
  fingertip for a finger or the pen, saying its key: back to the pages, the pens, the eraser, the colours,
  undo and redo, Record, Play and what was said. Every tool shows above the page with `\` or the column's
  handle, and Escape puts them away; Escape again, or Backspace, goes back to the pages. What is being
  recorded or played is a slim bar under the page, which fades while the pen writes.

- A recording that can't be transcribed says why in Omabook's own words (its speech-to-text status), so it
  stays right as Omabook's ways change: voxtype first now, then whisper.cpp, then a server (#12). A transcript
  without each word's moment, as voxtype's is, says so, and a word found in it plays from the start of its
  sentence. Works with Omabook 0.2.0 too, which says it through its recognition status.

## [1.0.0] - 2026-11-21

Needs Omabook 0.2.0.

### Added

- Notebooks, pages and paper in the library (#2): a notebook is a private book of its own format on the
  shelf, opened in the plugin's view; pages on lined (narrow, college, wide), squared, dotted, blank,
  music-stave or Cornell paper at A4, A5 or Letter, added, reordered and removed; loose notes filed into a
  notebook later. Kept in Omabook's change log; the notebook file is a snapshot.
- Ink on a page (#3): a page opens to write on with Omabook's ink surface, with a pen and a highlighter in a
  few colours and thicknesses, an eraser of parts or whole strokes, undo and redo, zoom, palm rejection, and
  a finger and the mouse as a fallback; keys for every tool. Strokes are kept per page in the change log,
  one write a pause of the pen, so two computers' strokes on one page merge. The pages' thumbnails show their
  ink, and paper is drawn in paper's colours in a dark theme too, so ink reads as it was written.
- Text blocks and pictures on a page (#4): with the Type tool (T) a tap on the paper, or Enter, puts a text
  block there, set on the paper's lines, typed in where it is as Markdown or plain text (M; never HTML);
  blocks and pictures are chosen with a tap or Tab, moved by dragging or the arrows, resized by their corner
  or Alt and the arrows, put above or below the ink (L) and to the front or back ([ ]), and removed
  (Delete). A picture comes from a file, picked (I) or dropped on the page, made at most 1600 pixels a side
  and 1 MB, without what the file said of where it was taken. Each is kept in the change log, so they merge
  between computers: a block moved on one and typed in on the other keeps both, and pictures travel with
  their page. Thumbnails show them too.
- Recognised text from handwriting (#6): a moment after the pen rests, a page's ink is read to text by a
  vision model on your AI server (Omabook's recognition), in the background, and kept in the change log with
  the strokes it came from; it is read again when they change. Text (R) shows it under the tools, where it is
  corrected by hand (never written over unasked) and made a text block where the ink lies, beside the ink or
  in its place. The Select tool (S) chooses strokes with a rectangle, to be read on their own. Handwriting goes
  only to your own servers; a hosted one only for a notebook that chose it and when Omabook's settings allow
  hosted servers, never for a loose note. With no server that may read it, the page says so plainly.
- Recordings tied to the ink, with transcripts (#5): Record (V) on a page records what is said while you
  write (Omabook asks once whether Notebooks may use the microphone, and its mark shows it records), and each
  stroke written meanwhile keeps its moment in the recording. With the Listen tool (A) a tap on the ink plays
  from when it was written; while a recording plays, the ink shows as it was then and what was just written
  glows. Each recording is transcribed in the background, each word with its moment, through your
  transcription server or whisper.cpp, and shown beside the page (W), where a tap on a sentence plays it;
  the notebook's book holds the words, so search finds them. Speech goes only to your own servers; a hosted
  one only for a notebook that chose it for speech (apart from handwriting) and when Omabook's settings
  allow hosted servers. Recordings go to your other computers with the plugin's data at a sync. Needs the
  `microphone` permission and an Omabook with `omabook.audio` (#79) and binary data files (#131).
- The notebook in search and the knowledge graph (#7): *Find in notebooks* over the list finds words typed,
  read from the ink or said, by the start of a word, case and accents aside; a hit opens its page, and one
  in a recording plays from the moment the words were said. The words read from the ink are in the
  notebook's book now too, beside the typed text and the transcripts, so Find (/) and the book's text have
  them. About (K) on a page offers the things of the knowledge graph its words name, to say yes or no to,
  and finds any other, or makes a new topic: each one said is tied to the notebook's book with the pages it
  is on, in the graph of the notebook's collections, so `knows:vin` on the shelf finds the notebook. Nothing
  goes into the graph unasked and no word goes to a model. Notebooks are books Notebooks keeps private
  (`"private"` in plugin.json, Omabook #127): nothing of one, its ties in the graph neither, goes into a
  shared or published space.
- The lasso on a page (#3): the Lasso (L) goes around strokes to drag them elsewhere, recolour them (1 to 4),
  copy, cut and paste them (Ctrl+C, Ctrl+X, Ctrl+V, also between pages) or take them away (Delete), each a
  step of undo. What it does is kept as erasing is, so it merges between computers: a stroke moved on one and
  recoloured on the other is both, never lost; a moved stroke keeps its moment in a recording. Needs an
  Omabook with the ink surface's lasso (#129).
- Writing beside reading, with place references (#8): Alt+N while reading opens the notebooks beside the book,
  the reader on one side and a page on the other; over the list, every page that refers to the book. A page
  or a loose note made there refers to where you are; on a page B refers to where the reader is (Shift+B to
  the words you copied there), tied to what the lasso or the Select tool holds, or the text block chosen. A
  reference is a chip on the page that opens the book at its passage (a click, a tap, or G); it is kept by its
  words as well as its place, so a new edition of the book finds it again, and one whose words are gone is
  kept as lost, never guessed at. In a notebook shared with others, a reference never shows what lies past
  where you have read to. The notebook's book names the passages its pages refer to. Needs the `clipboard`
  permission, for the copied words.
- Export to PDF and Markdown, and the AI reading notebooks (#9): Export under a notebook's title saves the
  notebook, or the page open, as a PDF (each page at its paper's size: the paper and the ink as lines, so they
  print sharp, typed text as text, pictures, the handwriting's recognised words unseen so they can be found and
  copied, and place references as links) or as Markdown (typed text, the handwriting's words, what was said
  with its moments, pictures as files beside it, place references as links with the words they refer to), by
  the name you give it. Ask under a notebook's title asks the AI chosen in
  Omabook's settings about the notebook ("what did I write about tides?"), or summarises it: it reads the
  notebook's own words alone, and of the books it refers to only the passages up to where you have read. A
  notebook is private: a hosted AI reads it only once you let it (*Let the AI read this notebook*, the same choice
  as a hosted server reading its handwriting), what was said while writing only when its recordings may go
  too, and nothing is sent with the AI off. From the command line: `exportNotebook` and `askNotebook`.
- Saving where you choose, links that open the book, and the AI's whereabouts from Omabook (#11): Export asks
  where to save with the desktop's own save dialog, and keeps nothing of it in the plugin's folder, which goes to
  your other computers (an export that took long to make waits for *Save…*); a Markdown export saved so holds its
  pictures in it, as the dialog writes one file. From the command line `exportNotebook` still saves under
  `data/exports/` by the name given, the pictures beside the Markdown. A place reference in a PDF or Markdown is
  an `omabook://book/<global id>/section/<n>` link, which opens Omabook at the passage on any of your computers,
  and a reference finds its book by that global id first. Whether the AI chosen in Omabook's settings is your own
  or someone else's is Omabook's to say now: your own reads any notebook, what was said in it too, and a hosted
  one only a notebook you let it read (*Let the AI read this notebook*), with Omabook sending nothing to anyone
  else's otherwise.
