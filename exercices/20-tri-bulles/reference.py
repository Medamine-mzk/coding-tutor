from numpy import array
n = int(input())
if n == 0:
    print("")
else:
    T = array([0] * n)
    for i in range(0, n):
        T[i] = int(input())
    for i in range(0, n):
        for j in range(0, n - i - 1):
            if T[j] > T[j + 1]:
                tmp = T[j]
                T[j] = T[j + 1]
                T[j + 1] = tmp
    for i in range(0, n):
        print(T[i])
