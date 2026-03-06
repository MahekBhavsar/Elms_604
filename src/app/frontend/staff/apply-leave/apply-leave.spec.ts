import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ApplyLeave } from './apply-leave';

describe('ApplyLeave', () => {
  let component: ApplyLeave;
  let fixture: ComponentFixture<ApplyLeave>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ApplyLeave]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ApplyLeave);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
