s = input()
ch = s.upper()
inv = ""
for i in range(len(ch) - 1, -1, -1):
    inv = inv + ch[i]
if inv == ch:
    print("oui")
else:
    print("non")
