from v6_name_gate import propose_names

def box(x,y,w=25,h=20):
    return [[x,y],[x+w,y],[x+w,y+h],[x,y+h]]

assert len(propose_names(['姓名','林奕辰'],[box(10,10),box(60,10)],[.99,.91],200))==1
assert not propose_names(['林奕辰'],[box(60,10)],[.91],200)
assert not propose_names(['姓名','林奕辰'],[box(10,10),box(60,90)],[.99,.91],200)
assert not propose_names(['姓名','林奕辰'],[box(10,10),box(60,10)],[.99,.70],200)
assert not propose_names(['姓名','林奕辰'],[box(10,10),box(60,150)],[.99,.91],200)
assert not propose_names(['姓名','ABC123'],[box(10,10),box(60,10)],[.99,.91],200)
print('v6 truth-blind gate synthetic tests passed')
