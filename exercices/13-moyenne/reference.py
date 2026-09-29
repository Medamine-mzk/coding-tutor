from numpy import array
n = int(input())
if n == 0:
    print("0.00")
else:
    T = array([0] * n)
    for i in range(0, n):
        T[i] = int(input())
    s = 0
    for i in range(0, n):
        s = s + T[i]
    m = s / n
    tmp = int(m * 100 + 0.5)
    ent = tmp // 100
    dec = tmp % 100
    if dec < 10:
        print(str(ent) + ".0" + str(dec))
    else:
        print(str(ent) + "." + str(dec))
