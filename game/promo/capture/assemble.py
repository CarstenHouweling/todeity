import os, sys, shutil
S = os.environ.get('WORK') or os.path.join(os.path.dirname(os.path.abspath(__file__)), 'work')
order = ['01','02','03','04','05','06','07','08','09','10','11','12','13']
seq = os.path.join(S, 'seq'); shutil.rmtree(seq, ignore_errors=True); os.makedirs(seq)
i = 0; marks = []
for d in order:
    files = sorted(os.listdir(os.path.join(S, 'frames', d)))
    marks.append((d, i, len(files)))
    for f in files:
        os.symlink(os.path.join(S, 'frames', d, f), os.path.join(seq, f'{i:05d}.jpg')); i += 1
print(i, marks)
