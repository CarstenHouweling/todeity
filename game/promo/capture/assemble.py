import os, sys, shutil
S = os.environ.get('WORK') or os.path.join(os.path.dirname(os.path.abspath(__file__)), 'work')
# Scene order; each shot is a whole number of bars of the music (see music.mjs and DEVELOPMENT.md, Promo material).
order = os.environ.get('ORDER', '00 01 02 03 04 05 06 07 08 09 10 11 12 12b 13').split()  # ORDER='j01 j02 …' for the other trailers
# Frame ranges to keep (inclusive), for scenes recorded longer than their slot: 04 keeps the skill pick's start and
# the brew offer's start (2 bars instead of 4).
keep = {'04': [(0, 54), (109, 162)]}
seq = os.path.join(S, 'seq'); shutil.rmtree(seq, ignore_errors=True); os.makedirs(seq)
i = 0; marks = []
for d in order:
    files = sorted(os.listdir(os.path.join(S, 'frames', d)))
    if d in keep: files = [f for a, b in keep[d] for f in files[a:b + 1]]
    marks.append((d, i, len(files)))
    for f in files:
        os.symlink(os.path.join(S, 'frames', d, f), os.path.join(seq, f'{i:05d}.jpg')); i += 1
print(i, marks)
