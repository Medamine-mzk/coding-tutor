from numpy import array
n = int(input())
if n == 0:
    print("empty")
else:
    T = array([0] * n)
    for i in range(0, n):
        T[i] = int(input())
    m = T[0]
    for i in range(1, n):
        if T[i] > m:
            m = T[i]
    print(m)
