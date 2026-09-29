from numpy import array
s = input()
T = array([''] * 100, dtype='U20')
n = 0
debut = 0
for i in range(0, len(s) + 1):
    fin = False
    if i == len(s):
        fin = True
    else:
        if s[i] == " ":
            fin = True
    if fin:
        if i > debut:
            T[n] = s[debut:i]
            n = n + 1
        debut = i + 1
if n == 0:
    print("")
else:
    maxmot = T[0]
    maxc = 0
    for i in range(0, n):
        c = 0
        for j in range(0, n):
            if T[j] == T[i]:
                c = c + 1
        if c > maxc:
            maxc = c
            maxmot = T[i]
    print(maxmot)
