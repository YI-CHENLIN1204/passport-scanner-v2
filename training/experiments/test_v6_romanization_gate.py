from v6_romanization_gate import corroborate_candidates, norm_latin

def identity(x): return {'林奕辰':'LINYICHEN','王大明':'WANGDAMING'}.get(x,'')
assert norm_latin('LIN, YI CHEN') == 'LINYICHEN'
assert corroborate_candidates([], 'LINYICHEN',identity)[0]=='no-candidates'
assert corroborate_candidates(['林奕辰'], '',identity)[0]=='no-ocr-english'
assert corroborate_candidates(['林奕辰','王大明'],'LIN YI CHEN',identity)[1]==['林奕辰']
assert corroborate_candidates(['王大明'],'LIN YI CHEN',identity)[0]=='no-exact-romanization'
assert corroborate_candidates(['林奕辰','林奕辰'],'LIN YI CHEN',identity)[0]=='ambiguous'
print('v6 offline romanization guard synthetic tests passed')
