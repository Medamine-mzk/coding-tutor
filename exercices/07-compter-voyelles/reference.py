s = input()
voyelles = "aeiouyAEIOUY"
c = 0
for i in range(0, len(s)):
    if s[i] in voyelles:
        c = c + 1
print(c)
