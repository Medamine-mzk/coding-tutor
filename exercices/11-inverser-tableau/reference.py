from numpy import array
n = int(input())
if n == 0:
    print("")
else:
    T = array([0] * n)
    for i in range(0, n):
        T[i] = int(input())
    for i in range(n - 1, -1, -1):
        print(T[i])
