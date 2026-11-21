# Changelog

What each release of Notebooks brought. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). A release names the
Omabook it needs.

## [Unreleased]

### Added

- Notebooks, pages and paper in the library (#2): a notebook is a private book of its own format on the
  shelf, opened in the plugin's view; pages on lined (narrow, college, wide), squared, dotted, blank,
  music-stave or Cornell paper at A4, A5 or Letter, added, reordered and removed; loose notes filed into a
  notebook later. Kept in Omabook's change log; the notebook file is a snapshot. Needs Omabook 0.1.10.
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
