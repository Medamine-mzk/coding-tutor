from numpy import array
n = int(input())
if n == 0:
    print(0)
else:
    T = array([0] * n)
    for i in range(0, n):
        T[i] = int(input())
    s = 0
    for i in range(0, n):
        s = s + T[i]
    print(s)
